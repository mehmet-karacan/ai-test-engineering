#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <string>
#include <vector>
#include <cwchar>

// Read-only Job topology probe; the child only reports its own Job membership.
int wmain(int argc, wchar_t** argv) {
  if (argc == 3 && wcscmp(argv[1], L"--pid") == 0) {
    wchar_t* end = nullptr;
    const unsigned long parsed = wcstoul(argv[2], &end, 10);
    if (!parsed || !end || *end != L'\0') return 5;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, static_cast<DWORD>(parsed));
    if (!process) return 6;
    BOOL member = FALSE;
    const BOOL ok = IsProcessInJob(process, nullptr, &member);
    CloseHandle(process);
    if (!ok) return 7;
    std::printf("pid=%lu in_job=%d\n", parsed, member ? 1 : 0);
    return 0;
  }
  BOOL in_job = FALSE;
  if (!IsProcessInJob(GetCurrentProcess(), nullptr, &in_job)) return 3;
  if (argc == 2 && wcscmp(argv[1], L"--child") == 0) return in_job ? 1 : 0;
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  const BOOL queried = QueryInformationJobObject(nullptr, JobObjectExtendedLimitInformation,
    &limits, sizeof(limits), nullptr);
  std::printf("parent_in_job=%d limits_query=%d flags=0x%08lx\n", in_job ? 1 : 0,
    queried ? 1 : 0, static_cast<unsigned long>(queried ? limits.BasicLimitInformation.LimitFlags : 0));
  wchar_t path[32768]{};
  const DWORD length = GetModuleFileNameW(nullptr, path, static_cast<DWORD>(sizeof(path) / sizeof(path[0])));
  if (!length || length >= sizeof(path) / sizeof(path[0])) return 4;
  std::wstring command = L"\"" + std::wstring(path) + L"\" --child";
  std::vector<wchar_t> mutable_command(command.begin(), command.end());
  mutable_command.push_back(L'\0');
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION child{};
  const BOOL created = CreateProcessW(path, mutable_command.data(), nullptr, nullptr, FALSE,
    CREATE_BREAKAWAY_FROM_JOB | CREATE_NO_WINDOW, nullptr, nullptr, &startup, &child);
  if (!created) {
    std::printf("breakaway_create=0 win32_error=%lu\n", static_cast<unsigned long>(GetLastError()));
    return 0;
  }
  WaitForSingleObject(child.hProcess, 10000);
  DWORD code = 999;
  GetExitCodeProcess(child.hProcess, &code);
  std::printf("breakaway_create=1 child_in_job=%lu\n", static_cast<unsigned long>(code));
  CloseHandle(child.hThread);
  CloseHandle(child.hProcess);
  return 0;
}
