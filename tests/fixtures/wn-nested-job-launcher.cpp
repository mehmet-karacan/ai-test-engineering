#include <windows.h>
#include <string>

int wmain(int argc, wchar_t** argv) {
  if (argc != 5) return 80;
  HANDLE outer = CreateJobObjectW(nullptr, nullptr);
  if (!outer) return 81;
  JOBOBJECT_BASIC_UI_RESTRICTIONS limits{};
  limits.UIRestrictionsClass = JOB_OBJECT_UILIMIT_HANDLES;
  if (!SetInformationJobObject(outer, JobObjectBasicUIRestrictions, &limits, sizeof(limits))) return 82;
  if (!AssignProcessToJobObject(outer, GetCurrentProcess())) return 83;
  std::wstring command = L"\"" + std::wstring(argv[1]) + L"\" \"" + argv[2] + L"\" \"" + argv[3] + L"\" \"" + argv[4] + L"\"";
  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION child{};
  if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &startup, &child)) return 84;
  WaitForSingleObject(child.hProcess, 30000);
  DWORD exit_code = 85;
  GetExitCodeProcess(child.hProcess, &exit_code);
  CloseHandle(child.hThread);
  CloseHandle(child.hProcess);
  CloseHandle(outer);
  return static_cast<int>(exit_code);
}
