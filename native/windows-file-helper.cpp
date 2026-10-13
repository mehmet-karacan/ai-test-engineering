// Windows path helper: each child name is opened relative to a held parent handle.
// The helper is intentionally narrow: inspect and CREATE_NEW copy only.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#include <cstdio>
#include <cstring>
#include <cwctype>
#include <memory>
#include <string>
#include <vector>

#pragma comment(lib, "ntdll.lib")
#pragma comment(lib, "bcrypt.lib")

namespace {
struct Handle {
  HANDLE value = INVALID_HANDLE_VALUE;
  explicit Handle(HANDLE h = INVALID_HANDLE_VALUE) : value(h) {}
  ~Handle() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  Handle(Handle&& other) noexcept : value(other.value) { other.value = INVALID_HANDLE_VALUE; }
  Handle& operator=(Handle&& other) noexcept {
    if (this != &other) { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); value = other.value; other.value = INVALID_HANDLE_VALUE; }
    return *this;
  }
};

struct Identity {
  FILE_ID_INFO id{};
  DWORD links = 0;
  unsigned long long bytes = 0;
  FILETIME lastWrite{};
};

bool safeComponent(const std::wstring& part) {
  if (part.empty() || part == L"." || part == L".." || part.size() > 255 || part.back() == L'.' || part.back() == L' ') return false;
  for (wchar_t c : part) if (c < 32 || wcschr(L"\\/:*?\"<>|", c)) return false;
  std::wstring upper;
  for (wchar_t c : part) { if (c == L'.') break; upper.push_back(static_cast<wchar_t>(towupper(c))); }
  if (upper == L"CON" || upper == L"PRN" || upper == L"AUX" || upper == L"NUL") return false;
  if (upper.size() == 4 && ((upper.substr(0, 3) == L"COM") || (upper.substr(0, 3) == L"LPT")) && upper[3] >= L'1' && upper[3] <= L'9') return false;
  return true;
}

bool splitPath(const std::wstring& path, bool absolute, std::wstring& driveRoot, std::vector<std::wstring>& parts) {
  size_t start = 0;
  if (absolute) {
    if (path.size() < 3 || !iswalpha(path[0]) || path[1] != L':' || (path[2] != L'\\' && path[2] != L'/')) return false;
    driveRoot = path.substr(0, 3);
    driveRoot[2] = L'\\';
    start = 3;
  } else if (path.empty() || path[0] == L'\\' || path[0] == L'/') return false;
  while (start < path.size()) {
    const size_t end = path.find_first_of(L"\\/", start);
    const std::wstring part = path.substr(start, end == std::wstring::npos ? end : end - start);
    if (!safeComponent(part)) return false;
    parts.push_back(part);
    if (end == std::wstring::npos) break;
    start = end + 1;
    if (start == path.size()) return false;
  }
  return absolute || !parts.empty();
}

bool validHandle(HANDLE h, bool directory) {
  FILE_ATTRIBUTE_TAG_INFO tag{};
  if (!GetFileInformationByHandleEx(h, FileAttributeTagInfo, &tag, sizeof(tag))) return false;
  if (tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) return false;
  return directory ? (tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 : (tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

bool openChild(HANDLE parent, const std::wstring& name, bool directory, bool create, DWORD access, Handle& result,
  ULONG share = FILE_SHARE_READ | FILE_SHARE_WRITE) {
  if (!safeComponent(name) || name.size() > 32767 / sizeof(wchar_t)) return false;
  UNICODE_STRING unicode{};
  unicode.Buffer = const_cast<PWSTR>(name.c_str());
  unicode.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  unicode.MaximumLength = unicode.Length;
  OBJECT_ATTRIBUTES attributes{};
  InitializeObjectAttributes(&attributes, &unicode, OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE, parent, nullptr);
  IO_STATUS_BLOCK io{};
  HANDLE opened = INVALID_HANDLE_VALUE;
  const ULONG opts = FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT | FILE_OPEN_FOR_BACKUP_INTENT |
    (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE);
  const NTSTATUS status = NtCreateFile(&opened, access | SYNCHRONIZE, &attributes, &io, nullptr,
    FILE_ATTRIBUTE_NORMAL, share, create ? FILE_CREATE : FILE_OPEN,
    opts, nullptr, 0);
  if (status < 0 || opened == INVALID_HANDLE_VALUE) return false;
  result = Handle(opened);
  return validHandle(result.value, directory);
}

bool openAbsolute(const std::wstring& path, bool directory, DWORD access, std::vector<Handle>& chain) {
  std::wstring drive;
  std::vector<std::wstring> parts;
  if (!splitPath(path, true, drive, parts)) return false;
  Handle root(CreateFileW(drive.c_str(), FILE_READ_ATTRIBUTES | SYNCHRONIZE, FILE_SHARE_READ | FILE_SHARE_WRITE,
    nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (root.value == INVALID_HANDLE_VALUE || !validHandle(root.value, true)) return false;
  chain.push_back(std::move(root));
  for (size_t i = 0; i < parts.size(); ++i) {
    const bool childDirectory = i + 1 < parts.size() || directory;
    Handle child;
    if (!openChild(chain.back().value, parts[i], childDirectory, false,
      childDirectory ? FILE_READ_ATTRIBUTES : access, child)) return false;
    chain.push_back(std::move(child));
  }
  return directory ? validHandle(chain.back().value, true) : parts.size() > 0;
}

bool openRelative(HANDLE root, const std::wstring& relative, bool createParents, DWORD finalAccess,
  std::vector<Handle>& chain, bool createFinal, ULONG finalShare = FILE_SHARE_READ | FILE_SHARE_WRITE) {
  std::wstring ignored;
  std::vector<std::wstring> parts;
  if (!splitPath(relative, false, ignored, parts)) return false;
  HANDLE parent = root;
  for (size_t i = 0; i < parts.size(); ++i) {
    const bool directory = i + 1 < parts.size();
    Handle child;
    if (!openChild(parent, parts[i], directory, !directory && createFinal,
      directory ? FILE_READ_ATTRIBUTES : finalAccess, child,
      directory ? FILE_SHARE_READ | FILE_SHARE_WRITE : finalShare)) {
      if (!directory || !createParents) return false;
      // The held parent chain disallows rename/delete; a newly inserted junction
      // cannot be followed because the subsequent open is relative + no-follow.
      if (!openChild(parent, parts[i], true, true, FILE_READ_ATTRIBUTES, child) &&
          !openChild(parent, parts[i], true, false, FILE_READ_ATTRIBUTES, child)) return false;
    }
    chain.push_back(std::move(child));
    parent = chain.back().value;
  }
  return true;
}

bool identity(HANDLE handle, Identity& result) {
  BY_HANDLE_FILE_INFORMATION basic{};
  LARGE_INTEGER size{};
  if (!GetFileInformationByHandleEx(handle, FileIdInfo, &result.id, sizeof(result.id)) ||
      !GetFileInformationByHandle(handle, &basic)) return false;
  if ((basic.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 &&
      (!GetFileSizeEx(handle, &size) || size.QuadPart < 0)) return false;
  result.links = basic.nNumberOfLinks;
  result.bytes = static_cast<unsigned long long>(size.QuadPart);
  result.lastWrite = basic.ftLastWriteTime;
  return result.links > 0;
}

bool sameIdentity(const Identity& a, const Identity& b) {
  return a.id.VolumeSerialNumber == b.id.VolumeSerialNumber &&
    std::memcmp(a.id.FileId.Identifier, b.id.FileId.Identifier, sizeof(a.id.FileId.Identifier)) == 0 &&
    a.links == b.links && a.bytes == b.bytes &&
    CompareFileTime(&a.lastWrite, &b.lastWrite) == 0;
}

void printIdentity(const Identity& item, const unsigned char* digest = nullptr) {
  std::printf("OK\t%016llx\t", item.id.VolumeSerialNumber);
  for (unsigned char byte : item.id.FileId.Identifier) std::printf("%02x", byte);
  std::printf("\t%lu\t%llu", item.links, item.bytes);
  if (digest) { std::printf("\t"); for (int i = 0; i < 32; ++i) std::printf("%02x", digest[i]); }
  std::printf("\n");
}

bool copyHeld(HANDLE source, HANDLE destination, unsigned char digest[32], unsigned long long& total) {
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
  bool ok = BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0) >= 0;
  std::unique_ptr<unsigned char[]> buffer(new unsigned char[1024 * 1024]);
  while (ok) {
    DWORD read = 0;
    if (!ReadFile(source, buffer.get(), 1024 * 1024, &read, nullptr)) { ok = false; break; }
    if (read == 0) break;
    if (BCryptHashData(hash, buffer.get(), read, 0) < 0) { ok = false; break; }
    DWORD written = 0;
    if (!WriteFile(destination, buffer.get(), read, &written, nullptr) || written != read) { ok = false; break; }
    total += read;
  }
  if (ok) ok = FlushFileBuffers(destination) != 0 && BCryptFinishHash(hash, digest, 32, 0) >= 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(alg, 0);
  return ok;
}

bool hashHeld(HANDLE file, unsigned char digest[32]) {
  LARGE_INTEGER origin{};
  if (!SetFilePointerEx(file, origin, nullptr, FILE_BEGIN)) return false;
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
  bool ok = BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0) >= 0;
  std::unique_ptr<unsigned char[]> buffer(new unsigned char[1024 * 1024]);
  while (ok) {
    DWORD read = 0;
    if (!ReadFile(file, buffer.get(), 1024 * 1024, &read, nullptr)) { ok = false; break; }
    if (read == 0) break;
    if (BCryptHashData(hash, buffer.get(), read, 0) < 0) { ok = false; break; }
  }
  if (ok) ok = BCryptFinishHash(hash, digest, 32, 0) >= 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(alg, 0);
  return ok;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 3 && wcscmp(argv[1], L"inspect") == 0) {
    std::vector<Handle> chain;
    if (!openAbsolute(argv[2], false, FILE_READ_ATTRIBUTES, chain)) {
      chain.clear();
      if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, chain)) return 2;
    }
    Identity info;
    if (!identity(chain.back().value, info)) return 2;
    printIdentity(info);
    return 0;
  }
  if (argc == 6 && wcscmp(argv[1], L"copy") == 0) {
    std::wstring sourceDrive, targetDrive;
    std::vector<std::wstring> sourceParts, targetParts;
    if (!splitPath(argv[2], true, sourceDrive, sourceParts) ||
        !splitPath(argv[4], true, targetDrive, targetParts)) return 2;
    if (towupper(sourceDrive[0]) != towupper(targetDrive[0])) return 3;
    std::vector<Handle> sourceRoot, source, targetRoot, target;
    if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, sourceRoot) ||
        !openRelative(sourceRoot.back().value, argv[3], false, GENERIC_READ | FILE_READ_ATTRIBUTES, source, false,
          FILE_SHARE_READ)) return 2;
    Identity sourceInfo;
    if (!identity(source.back().value, sourceInfo) || sourceInfo.links != 1) return 2;
    if (!openAbsolute(argv[4], true, FILE_READ_ATTRIBUTES, targetRoot)) return 2;
    Identity sourceRootInfo, targetRootInfo;
    if (!identity(sourceRoot.back().value, sourceRootInfo) || !identity(targetRoot.back().value, targetRootInfo) ||
        sourceRootInfo.id.VolumeSerialNumber != targetRootInfo.id.VolumeSerialNumber) return 3;
    if (!openRelative(targetRoot.back().value, argv[5], true,
      GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE, target, true, 0)) return 2;
    unsigned char digest[32]{};
    unsigned char targetDigest[32]{};
    unsigned long long copied = 0;
    Identity targetInfo, sourceAfter;
    if (!copyHeld(source.back().value, target.back().value, digest, copied) ||
        !identity(target.back().value, targetInfo) || targetInfo.bytes != copied || sourceInfo.bytes != copied ||
        !identity(source.back().value, sourceAfter) || !sameIdentity(sourceInfo, sourceAfter) ||
        !hashHeld(target.back().value, targetDigest) || std::memcmp(digest, targetDigest, 32) != 0) {
      FILE_DISPOSITION_INFO disposition{TRUE};
      SetFileInformationByHandle(target.back().value, FileDispositionInfo, &disposition, sizeof(disposition));
      return 2;
    }
    printIdentity(targetInfo, digest);
    return 0;
  }
  return 2;
}
