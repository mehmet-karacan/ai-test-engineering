#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <bcrypt.h>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <cwctype>
#include <string>
#include <vector>

#pragma comment(lib, "bcrypt.lib")

// This helper owns the only Job Object handle. Child execution starts suspended,
// enters the job, and resumes only after KILL_ON_JOB_CLOSE is in force.
static std::atomic<int> stop_reason{0}; // 0 natural, 1 cancel, 2 parent pipe closed
static std::atomic<bool> shutting_down{false};
static HANDLE owned_job = nullptr;
static HANDLE status_file = INVALID_HANDLE_VALUE;

struct HeldPaths {
  std::vector<HANDLE> handles;
  ~HeldPaths() { for (HANDLE handle : handles) CloseHandle(handle); }
};

// Open every ancestor itself, not a path through a junction. Holding directory
// handles without FILE_SHARE_DELETE prevents a concurrent path replacement.
// The final file is read-shared only, so writing or replacing it fails while
// the owned process is alive.
static bool pin_path(const wchar_t* path, const wchar_t* expected_hex, HeldPaths& held) {
  if (!path || !expected_hex || wcslen(expected_hex) != 64 ||
      wcslen(path) < 4 || !iswalpha(path[0]) || path[1] != L':' || path[2] != L'\\') return false;
  for (size_t i = 0; i < 64; ++i) {
    const wchar_t c = expected_hex[i];
    if (!((c >= L'0' && c <= L'9') || (c >= L'a' && c <= L'f'))) return false;
  }
  std::wstring current(path, 3);
  HANDLE root = CreateFileW(current.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ,
    nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  if (root == INVALID_HANDLE_VALUE) return false;
  held.handles.push_back(root);
  size_t start = 3;
  const size_t length = wcslen(path);
  for (;;) {
    const size_t next = std::wstring(path).find(L'\\', start);
    const bool last = next == std::wstring::npos;
    const size_t end = last ? length : next;
    if (end == start || (end - start == 1 && path[start] == L'.') ||
        (end - start == 2 && path[start] == L'.' && path[start + 1] == L'.')) return false;
    current.assign(path, end);
    HANDLE opened = CreateFileW(current.c_str(), last ? GENERIC_READ : FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ,
      nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT | (last ? 0 : FILE_FLAG_BACKUP_SEMANTICS), nullptr);
    if (opened == INVALID_HANDLE_VALUE) return false;
    held.handles.push_back(opened);
    FILE_ATTRIBUTE_TAG_INFO tag{};
    if (!GetFileInformationByHandleEx(opened, FileAttributeTagInfo, &tag, sizeof(tag)) ||
        (tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ||
        (last ? (tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 : (tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0)) return false;
    if (last) break;
    start = next + 1;
  }
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
  bool ok = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) >= 0;
  unsigned char buffer[65536];
  while (ok) {
    DWORD count = 0;
    if (!ReadFile(held.handles.back(), buffer, sizeof(buffer), &count, nullptr)) { ok = false; break; }
    if (count == 0) break;
    ok = BCryptHashData(hash, buffer, count, 0) >= 0;
  }
  unsigned char digest[32]{};
  if (ok) ok = BCryptFinishHash(hash, digest, sizeof(digest), 0) >= 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (!ok) return false;
  static constexpr wchar_t digits[] = L"0123456789abcdef";
  for (size_t i = 0; i < sizeof(digest); ++i) {
    if (expected_hex[i * 2] != digits[digest[i] >> 4] ||
        expected_hex[i * 2 + 1] != digits[digest[i] & 15]) return false;
  }
  return true;
}

// The manifest is itself held by pin_path before any of its entries are used.
// This keeps the approved bytes stable while the Job Object owns the child.
static bool read_pinned_manifest(HANDLE file, std::string& bytes) {
  LARGE_INTEGER size{};
  if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0 || size.QuadPart > 1024 * 1024) return false;
  LARGE_INTEGER start{};
  if (!SetFilePointerEx(file, start, nullptr, FILE_BEGIN)) return false;
  bytes.resize(static_cast<size_t>(size.QuadPart));
  DWORD count = 0;
  return ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr) && count == bytes.size();
}

static bool pin_manifest_entries(const std::string& bytes, HeldPaths& held, bool& absent) {
  if (bytes.empty() || bytes.back() != '\n') return false;
  size_t start = 0;
  size_t entries = 0;
  while (start < bytes.size()) {
    const size_t end = bytes.find('\n', start);
    const size_t separator = bytes.find('\t', start);
    if (end == std::string::npos || separator == std::string::npos || separator >= end ||
        ++entries > 4096 || separator + 1 == end ||
        (separator - start != 64 && separator - start != 1) ||
        bytes.find('\t', separator + 1) < end) return false;
    const std::string digest = bytes.substr(start, separator - start);
    const std::string path_bytes = bytes.substr(separator + 1, end - separator - 1);
    if (path_bytes.find('\0') != std::string::npos || path_bytes.find('\r') != std::string::npos) return false;
    const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
      path_bytes.data(), static_cast<int>(path_bytes.size()), nullptr, 0);
    if (count <= 0) return false;
    std::wstring path(static_cast<size_t>(count), L'\0');
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path_bytes.data(),
          static_cast<int>(path_bytes.size()), path.data(), count) != count) return false;
    if (digest == "-") { absent = true; return false; }
    std::wstring wide_digest(digest.begin(), digest.end());
    if (!pin_path(path.c_str(), wide_digest.c_str(), held)) return false;
    start = end + 1;
  }
  return entries > 0;
}

static std::string json_status(const char* kind, DWORD error, DWORD exit_code) {
  char bytes[192];
  std::snprintf(bytes, sizeof(bytes), "{\"kind\":\"%s\",\"win32_error\":%lu,\"exit_code\":%lu}\n",
    kind, static_cast<unsigned long>(error), static_cast<unsigned long>(exit_code));
  return bytes;
}

static void write_status(const char* kind, DWORD error = 0, DWORD exit_code = 0) {
  if (status_file == INVALID_HANDLE_VALUE) return;
  const std::string bytes = json_status(kind, error, exit_code);
  DWORD written = 0;
  WriteFile(status_file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr);
  FlushFileBuffers(status_file);
  CloseHandle(status_file);
  status_file = INVALID_HANDLE_VALUE;
}

static DWORD WINAPI watch_parent(LPVOID) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  char command = 0;
  DWORD count = 0;
  const BOOL read = ReadFile(input, &command, 1, &count, nullptr);
  if (shutting_down.load()) return 0;
  stop_reason.store(read && count == 1 && command == 'C' ? 1 : 2);
  if (owned_job) TerminateJobObject(owned_job, 1);
  return 0;
}

static void stop_watcher(HANDLE watcher) {
  shutting_down.store(true);
  CancelSynchronousIo(watcher);
  WaitForSingleObject(watcher, INFINITE);
  CloseHandle(watcher);
}

int wmain(int argc, wchar_t** argv) {
  const bool manifest_mode = argc == 8 && wcscmp(argv[5], L"@manifest") == 0;
  if (!manifest_mode && (argc < 7 || (argc - 5) % 2 != 0)) return 90;
  const wchar_t* status_path = argv[1];
  const wchar_t* cwd = argv[2];
  const wchar_t* executable = argv[3];
  const wchar_t* command_line = argv[4];
  // Reserve the status path before launching customer code. Share mode zero
  // prevents a child from planting a forged successful status mid-run.
  status_file = CreateFileW(status_path, GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (status_file == INVALID_HANDLE_VALUE) return 91;
  wchar_t system_directory[MAX_PATH]{};
  const UINT system_length = GetSystemDirectoryW(system_directory, MAX_PATH);
  if (system_length == 0 || system_length >= MAX_PATH ||
      _wcsicmp(executable, (std::wstring(system_directory) + L"\\cmd.exe").c_str()) != 0) {
    write_status("cmd_path_error", ERROR_INVALID_NAME);
    return 92;
  }
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  HANDLE error_output = GetStdHandle(STD_ERROR_HANDLE);
  if (!input || input == INVALID_HANDLE_VALUE || !output || output == INVALID_HANDLE_VALUE ||
      !error_output || error_output == INVALID_HANDLE_VALUE) {
    write_status("invalid_stdio", GetLastError());
    return 93;
  }
  HeldPaths pinned;
  if (manifest_mode) {
    if (!pin_path(argv[7], argv[6], pinned)) {
      write_status("pin_mismatch", ERROR_SHARING_VIOLATION);
      return 102;
    }
    std::string bytes;
    const HANDLE manifest_file = pinned.handles.back();
    bool absent = false;
    if (!read_pinned_manifest(manifest_file, bytes) || !pin_manifest_entries(bytes, pinned, absent)) {
      write_status(absent ? "pin_unavailable" : "pin_mismatch", absent ? ERROR_FILE_NOT_FOUND : ERROR_INVALID_DATA);
      return 102;
    }
  } else for (int i = 5; i < argc; i += 2) {
    // A missing config cannot be held against later creation on a writable
    // workspace. Keep the gate closed until a frozen tree can supply it.
    if (wcscmp(argv[i], L"-") == 0) {
      write_status("pin_unavailable", ERROR_FILE_NOT_FOUND);
      return 102;
    }
    if (!pin_path(argv[i + 1], argv[i], pinned)) {
      write_status("pin_mismatch", ERROR_SHARING_VIOLATION);
      return 102;
    }
  }
  owned_job = CreateJobObjectW(nullptr, nullptr);
  if (!owned_job) { write_status("create_job_error", GetLastError()); return 93; }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(owned_job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    const DWORD failure = GetLastError();
    write_status("set_job_error", failure);
    CloseHandle(owned_job);
    return 94;
  }

  HANDLE nul = CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
    OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (nul == INVALID_HANDLE_VALUE) {
    const DWORD failure = GetLastError();
    write_status("stdin_error", failure);
    CloseHandle(owned_job);
    return 95;
  }
  if (!SetHandleInformation(nul, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) {
    const DWORD failure = GetLastError();
    write_status("stdin_inherit_error", failure);
    CloseHandle(nul);
    CloseHandle(owned_job);
    return 95;
  }
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = nul;
  startup.hStdOutput = output;
  startup.hStdError = error_output;
  PROCESS_INFORMATION process{};
  std::vector<wchar_t> mutable_command(command_line, command_line + wcslen(command_line) + 1);
  const BOOL created = CreateProcessW(executable, mutable_command.data(), nullptr, nullptr, TRUE,
    CREATE_SUSPENDED | CREATE_NO_WINDOW, nullptr, cwd, &startup, &process);
  CloseHandle(nul);
  if (!created) {
    const DWORD failure = GetLastError();
    write_status("create_process_error", failure);
    CloseHandle(owned_job);
    return 96;
  }
#ifdef AITEST_TEST_FORCE_ASSIGN_FAILURE
  SetLastError(ERROR_ACCESS_DENIED);
  const BOOL assigned = FALSE;
#else
  const BOOL assigned = AssignProcessToJobObject(owned_job, process.hProcess);
#endif
  if (!assigned) {
    const DWORD failure = GetLastError();
    TerminateProcess(process.hProcess, 1);
    WaitForSingleObject(process.hProcess, INFINITE);
    write_status("assign_job_error", failure);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(owned_job);
    return 97;
  }
  HANDLE watcher = CreateThread(nullptr, 0, watch_parent, nullptr, 0, nullptr);
  if (!watcher) {
    const DWORD failure = GetLastError();
    TerminateJobObject(owned_job, 1);
    write_status("watcher_error", failure);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(owned_job);
    return 98;
  }
  if (ResumeThread(process.hThread) == static_cast<DWORD>(-1)) {
    const DWORD failure = GetLastError();
    TerminateJobObject(owned_job, 1);
    stop_watcher(watcher);
    write_status("resume_error", failure);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    CloseHandle(owned_job);
    return 99;
  }
  CloseHandle(process.hThread);

  DWORD active = 1;
  for (;;) {
    WaitForSingleObject(process.hProcess, 50);
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
    if (!QueryInformationJobObject(owned_job, JobObjectBasicAccountingInformation, &accounting,
        sizeof(accounting), nullptr)) {
      const DWORD failure = GetLastError();
      TerminateJobObject(owned_job, 1);
      stop_watcher(watcher);
      write_status("query_job_error", failure);
      CloseHandle(process.hProcess);
      CloseHandle(owned_job);
      return 100;
    }
    active = accounting.ActiveProcesses;
    if (active == 0) break;
  }
  DWORD exit_code = 1;
  GetExitCodeProcess(process.hProcess, &exit_code);
  const int stopped = stop_reason.load();
  stop_watcher(watcher);
  write_status(stopped == 1 ? "cancelled" : stopped == 2 ? "owner_lost" : "exited", 0, exit_code);
  CloseHandle(process.hProcess);
  CloseHandle(owned_job);
  return stopped == 0 ? 0 : 101;
}
