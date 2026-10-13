#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <atomic>
#include <cstdio>
#include <string>
#include <vector>

// This helper owns the only Job Object handle. Child execution starts suspended,
// enters the job, and resumes only after KILL_ON_JOB_CLOSE is in force.
static std::atomic<int> stop_reason{0}; // 0 natural, 1 cancel, 2 parent pipe closed
static std::atomic<bool> shutting_down{false};
static HANDLE owned_job = nullptr;
static HANDLE status_file = INVALID_HANDLE_VALUE;

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
  if (argc != 5) return 90;
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
  if (!AssignProcessToJobObject(owned_job, process.hProcess)) {
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
