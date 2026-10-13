// Windows path helper: each child name is opened relative to a held parent handle.
// The helper also pins restore/recovery files until their journal owner closes it.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#include <cstdio>
#include <cstddef>
#include <cstring>
#include <cwctype>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#pragma comment(lib, "ntdll.lib")
#pragma comment(lib, "bcrypt.lib")

extern "C" NTSYSAPI NTSTATUS NTAPI NtSetInformationFile(HANDLE file, PIO_STATUS_BLOCK io,
  PVOID information, ULONG length, FILE_INFORMATION_CLASS kind);

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
  ULONG share = FILE_SHARE_READ | FILE_SHARE_WRITE, NTSTATUS* statusOut = nullptr, ULONG extraOptions = 0) {
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
    (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE) | extraOptions;
  const NTSTATUS status = NtCreateFile(&opened, access | SYNCHRONIZE, &attributes, &io, nullptr,
    FILE_ATTRIBUTE_NORMAL, share, create ? FILE_CREATE : FILE_OPEN,
    opts, nullptr, 0);
  if (statusOut) *statusOut = status;
  if (status < 0 || opened == INVALID_HANDLE_VALUE) return false;
  result = Handle(opened);
  return validHandle(result.value, directory);
}

bool openAbsolute(const std::wstring& path, bool directory, DWORD access, std::vector<Handle>& chain,
  ULONG finalShare = FILE_SHARE_READ | FILE_SHARE_WRITE) {
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
      childDirectory ? FILE_READ_ATTRIBUTES : access, child,
      childDirectory ? FILE_SHARE_READ | FILE_SHARE_WRITE : finalShare)) return false;
    chain.push_back(std::move(child));
  }
  return directory ? validHandle(chain.back().value, true) : parts.size() > 0;
}

bool openRelative(HANDLE root, const std::wstring& relative, bool createParents, DWORD finalAccess,
  std::vector<Handle>& chain, bool createFinal, ULONG finalShare = FILE_SHARE_READ | FILE_SHARE_WRITE,
  ULONG finalOptions = 0) {
  std::wstring ignored;
  std::vector<std::wstring> parts;
  if (!splitPath(relative, false, ignored, parts)) return false;
  HANDLE parent = root;
  for (size_t i = 0; i < parts.size(); ++i) {
    const bool directory = i + 1 < parts.size();
    Handle child;
    if (!openChild(parent, parts[i], directory, !directory && createFinal,
      directory ? FILE_READ_ATTRIBUTES : finalAccess, child,
      directory ? FILE_SHARE_READ | FILE_SHARE_WRITE : finalShare, nullptr,
      directory ? 0 : finalOptions)) {
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

bool sameFileId(const Identity& a, const Identity& b) {
  return a.id.VolumeSerialNumber == b.id.VolumeSerialNumber &&
    std::memcmp(a.id.FileId.Identifier, b.id.FileId.Identifier, sizeof(a.id.FileId.Identifier)) == 0;
}

void printIdentity(const Identity& item, const unsigned char* digest = nullptr) {
  std::printf("OK\t%016llx\t", item.id.VolumeSerialNumber);
  for (unsigned char byte : item.id.FileId.Identifier) std::printf("%02x", byte);
  std::printf("\t%lu\t%llu", item.links, item.bytes);
  if (digest) { std::printf("\t"); for (int i = 0; i < 32; ++i) std::printf("%02x", digest[i]); }
  std::printf("\n");
}

enum class CopyFault { None, HaltAfterFirstWrite, FailAfterFirstWrite };

bool copyHeld(HANDLE source, HANDLE destination, unsigned char digest[32], unsigned long long& total,
  CopyFault fault = CopyFault::None) {
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
#ifdef AITEST_FAULT_FIXTURE
    if (fault != CopyFault::None) {
      if (!FlushFileBuffers(destination)) { ok = false; break; }
      std::printf("%s\t%llu\n", fault == CopyFault::HaltAfterFirstWrite ? "PARTIAL_WRITTEN" : "PARTIAL_FAILURE", total);
      std::fflush(stdout);
      if (fault == CopyFault::HaltAfterFirstWrite) Sleep(INFINITE);
      ok = false;
      break;
    }
#else
    (void)fault;
#endif
  }
  if (ok) ok = FlushFileBuffers(destination) != 0 && BCryptFinishHash(hash, digest, 32, 0) >= 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(alg, 0);
  return ok;
}

#ifdef AITEST_FAULT_FIXTURE
// Faults can only run in the owned Temp fixture, never on a customer data path.
bool ownedStageFaultFixture(const wchar_t* targetRoot) {
  wchar_t temp[MAX_PATH + 1]{};
  const DWORD length = GetTempPathW(MAX_PATH + 1, temp);
  if (length == 0 || length > MAX_PATH || _wcsnicmp(targetRoot, temp, length) != 0) return false;
  const wchar_t* relative = targetRoot + length;
  constexpr wchar_t prefix[] = L"aitest-stage-hardkill-";
  const size_t prefixLength = (sizeof(prefix) / sizeof(prefix[0])) - 1;
  if (_wcsnicmp(relative, prefix, prefixLength) != 0) return false;
  const wchar_t* separator = wcschr(relative + prefixLength, L'\\');
  return separator != nullptr && wcscmp(separator, L"\\target") == 0;
}

bool fixtureFaultRequested(const wchar_t* name, const wchar_t* targetRoot) {
  wchar_t value[2]{};
  return ownedStageFaultFixture(targetRoot) && GetEnvironmentVariableW(name, value, 2) == 1 && value[0] == L'1';
}
#endif

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

std::wstring fileIdHex(const Identity& item) {
  wchar_t chars[33]{};
  for (size_t i = 0; i < sizeof(item.id.FileId.Identifier); ++i) {
    std::swprintf(chars + i * 2, 3, L"%02x", item.id.FileId.Identifier[i]);
  }
  return chars;
}

std::wstring digestHex(const unsigned char digest[32]) {
  wchar_t chars[65]{};
  for (size_t i = 0; i < 32; ++i) std::swprintf(chars + i * 2, 3, L"%02x", digest[i]);
  return chars;
}

bool renameHeld(HANDLE source, HANDLE targetDirectory, const std::wstring& targetName) {
  if (!safeComponent(targetName)) return false;
  const size_t nameBytes = targetName.size() * sizeof(wchar_t);
  if (nameBytes > 32767) return false;
  std::vector<unsigned char> buffer(offsetof(FILE_RENAME_INFO, FileName) + nameBytes);
  auto* rename = reinterpret_cast<FILE_RENAME_INFO*>(buffer.data());
  rename->ReplaceIfExists = FALSE;
  rename->RootDirectory = targetDirectory;
  rename->FileNameLength = static_cast<DWORD>(nameBytes);
  std::memcpy(rename->FileName, targetName.data(), nameBytes);
  IO_STATUS_BLOCK io{};
  return NtSetInformationFile(source, &io, rename, static_cast<ULONG>(buffer.size()),
    static_cast<FILE_INFORMATION_CLASS>(10)) >= 0;
}

struct NativeLinkInfo { BOOLEAN ReplaceIfExists; HANDLE RootDirectory; ULONG FileNameLength; WCHAR FileName[1]; };

bool linkHeld(HANDLE source, HANDLE targetDirectory, const std::wstring& targetName) {
  if (!safeComponent(targetName)) return false;
  const size_t nameBytes = targetName.size() * sizeof(wchar_t);
  if (nameBytes > 32767) return false;
  std::vector<unsigned char> buffer(offsetof(NativeLinkInfo, FileName) + nameBytes);
  auto* link = reinterpret_cast<NativeLinkInfo*>(buffer.data());
  link->ReplaceIfExists = FALSE;
  link->RootDirectory = targetDirectory;
  link->FileNameLength = static_cast<ULONG>(nameBytes);
  std::memcpy(link->FileName, targetName.data(), nameBytes);
  IO_STATUS_BLOCK io{};
  return NtSetInformationFile(source, &io, link, static_cast<ULONG>(buffer.size()),
    static_cast<FILE_INFORMATION_CLASS>(11)) >= 0;
}

bool decodeName(const std::wstring& encoded, std::wstring& name) {
  if (encoded.empty() || encoded.size() % 4 != 0 || encoded.size() > 1020) return false;
  name.clear();
  for (size_t i = 0; i < encoded.size(); i += 4) {
    unsigned value = 0;
    for (size_t j = 0; j < 4; ++j) {
      const wchar_t c = encoded[i + j];
      const int nibble = c >= L'0' && c <= L'9' ? c - L'0' :
        c >= L'a' && c <= L'f' ? c - L'a' + 10 : -1;
      if (nibble < 0) return false;
      value = (value << 4) | static_cast<unsigned>(nibble);
    }
    // Node Buffer.from(name, "utf16le").toString("hex") is byte little-endian.
    name.push_back(static_cast<wchar_t>((value >> 8) | ((value & 0xff) << 8)));
  }
  return safeComponent(name);
}

std::string encodeName(const std::wstring& name) {
  char encoded[5]{};
  std::string result;
  for (wchar_t c : name) {
    std::snprintf(encoded, sizeof(encoded), "%02x%02x", c & 0xff, (c >> 8) & 0xff);
    result += encoded;
  }
  return result;
}

std::string ascii(const std::wstring& value) {
  std::string result;
  for (wchar_t c : value) {
    if (c > 127) return {};
    result.push_back(static_cast<char>(c));
  }
  return result;
}

bool uuidAtEnd(const std::wstring& value, const std::wstring& prefix) {
  if (value.size() != prefix.size() + 36 || value.compare(0, prefix.size(), prefix) != 0) return false;
  for (size_t i = 0; i < 36; ++i) {
    const wchar_t c = value[prefix.size() + i];
    if (i == 8 || i == 13 || i == 18 || i == 23) { if (c != L'-') return false; }
    else if (!((c >= L'0' && c <= L'9') || (c >= L'a' && c <= L'f'))) return false;
  }
  return true;
}

struct SessionSlot {
  const char* key;
  std::wstring currentName;
  Handle file;
  bool present = false;
  bool readGuard = false;
};

struct TwoBlobGuardItem {
  std::wstring rootPath;
  std::wstring parentRelative;
  std::wstring names[3];
  std::vector<Handle> root;
  std::vector<Handle> parents;
  std::vector<Handle> reserved;
  Handle owned;
  bool hasOwned = false;
  Identity rootId, parentId, ownedId;
  unsigned char ownedDigest[32]{};
};

// Session commands are bounded before allocating an untrusted full line.
bool readSessionLine(std::string& line) {
  constexpr size_t maximum = 1024 * 1024;
  line.clear();
  for (;;) {
    const int next = std::cin.get();
    if (next == EOF) return false;
    if (next == '\n') return true;
    if (line.size() == maximum) return false;
    line.push_back(static_cast<char>(next));
  }
}

bool snapshot(HANDLE file, Identity& info, unsigned char digest[32]) {
  return identity(file, info) && info.links == 1 && hashHeld(file, digest);
}

void printSnapshot(HANDLE file) {
  Identity info;
  unsigned char digest[32]{};
  if (!snapshot(file, info, digest)) return;
  std::printf("%016llx:%ls:%llu:%ls", info.id.VolumeSerialNumber,
    fileIdHex(info).c_str(), info.bytes, digestHex(digest).c_str());
}

bool sidecarsStillOwned(HANDLE root, const std::wstring& dbName, SessionSlot (&slots)[4]) {
  for (size_t i = 1; i <= 2; ++i) {
    const std::wstring original = dbName + (i == 1 ? L"-wal" : L"-shm");
    Handle observed;
    NTSTATUS status = 0;
    if (!openChild(root, original, false, false, GENERIC_READ | FILE_READ_ATTRIBUTES,
      observed, FILE_SHARE_READ | FILE_SHARE_DELETE, &status)) {
      if (status == static_cast<NTSTATUS>(0xC0000034L) &&
          (!slots[i].present || slots[i].currentName != original)) continue;
      return false;
    }
    if (!slots[i].present || slots[i].currentName != original) return false;
    Identity held, found;
    unsigned char heldDigest[32]{}, foundDigest[32]{};
    if (!snapshot(slots[i].file.value, held, heldDigest) ||
        !snapshot(observed.value, found, foundDigest) || !sameIdentity(held, found) ||
        std::memcmp(heldDigest, foundDigest, 32) != 0) return false;
  }
  return true;
}

std::vector<std::string> splitTabs(const std::string& line) {
  std::vector<std::string> fields;
  size_t start = 0;
  while (true) {
    const size_t end = line.find('\t', start);
    fields.push_back(line.substr(start, end == std::string::npos ? end : end - start));
    if (end == std::string::npos) return fields;
    start = end + 1;
  }
}

bool decodeUtf16Hex(const std::string& encoded, std::wstring& path);
bool decodeBytesHex(const std::string& encoded, std::string& bytes);
bool expectedRoot(const Identity& actual, const wchar_t* volume, const wchar_t* id);

int restoreSession(int argc, wchar_t** argv, bool recovering) {
  if (argc != (recovering ? 7 : 6)) return 2;
  std::wstring dbName, stagedName, preservedName;
  if (!decodeName(argv[3], dbName) || !decodeName(argv[4], stagedName) ||
      !uuidAtEnd(stagedName, dbName + L".restore-")) return 2;
  if (recovering && (!decodeName(argv[5], preservedName) ||
      !uuidAtEnd(preservedName, dbName + L".restore-old-"))) return 2;
  const std::string generation = ascii(argv[recovering ? 6 : 5]);
  if (generation.size() != 36) return 2;
  for (char c : generation) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c == '-')) return 2;
  std::vector<Handle> root;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  SessionSlot slots[4] = {
    { "oldDb", dbName, Handle{} }, { "oldWal", dbName + L"-wal", Handle{} },
    { "oldShm", dbName + L"-shm", Handle{} }, { "stagedDb", stagedName, Handle{} },
  };
  std::wstring preservedSuffix = recovering ? preservedName.substr(dbName.size()) : L"";
  unsigned sequence = 0;
  if (recovering) {
    // Open every extant candidate with DELETE access and no delete sharing before READY.
    // A concurrent raw SQLite handle or ambiguous duplicate path aborts without mutation.
    auto openAt = [&](SessionSlot& slot, const std::wstring& name) -> int {
      NTSTATUS status = 0;
      Handle held;
      if (!openChild(root.back().value, name, false, false,
          GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, held, FILE_SHARE_READ, &status)) {
        return status == static_cast<NTSTATUS>(0xC0000034L) ? 0 : -1;
      }
      Identity info;
      unsigned char digest[32]{};
      if (!snapshot(held.value, info, digest)) return -1;
      slot.file = std::move(held);
      slot.currentName = name;
      slot.present = true;
      return 1;
    };
    auto absent = [&](const std::wstring& name) -> bool {
      NTSTATUS status = 0;
      Handle observed;
      return !openChild(root.back().value, name, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, observed, FILE_SHARE_READ, &status) &&
        status == static_cast<NTSTATUS>(0xC0000034L);
    };
    const int preservedDb = openAt(slots[0], preservedName);
    if (preservedDb < 0 || (preservedDb == 0 && openAt(slots[0], dbName) != 1)) return 2;
    if (preservedDb == 1) ++sequence;
    for (size_t i = 1; i <= 2; ++i) {
      const std::wstring original = dbName + (i == 1 ? L"-wal" : L"-shm");
      const int preserved = openAt(slots[i], original + preservedSuffix);
      if (preserved < 0) return 2;
      if (preserved == 1) {
        if (!absent(original)) return 2;
        ++sequence;
      } else if (openAt(slots[i], original) < 0) return 2;
    }
    const int staged = openAt(slots[3], stagedName);
    if (staged < 0 || (staged == 0 && (preservedDb != 1 || openAt(slots[3], dbName) != 1))) return 2;
    if (staged == 0) ++sequence;
    if ((preservedDb == 1 && staged == 1 && !absent(dbName)) ||
        (preservedDb == 0 && !absent(preservedName)) ||
        (staged == 0 && !absent(stagedName)) ||
        (preservedDb == 0 && (slots[1].present && slots[1].currentName != dbName + L"-wal" ||
                              slots[2].present && slots[2].currentName != dbName + L"-shm")) ||
        (staged == 0 && (slots[1].present && slots[1].currentName == dbName + L"-wal" ||
                         slots[2].present && slots[2].currentName == dbName + L"-shm")) ||
        (slots[2].present && slots[2].currentName != dbName + L"-shm" &&
         slots[1].present && slots[1].currentName == dbName + L"-wal")) return 2;
  } else {
    for (size_t i = 0; i < 4; ++i) {
      NTSTATUS status = 0;
      if (!openChild(root.back().value, slots[i].currentName, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, slots[i].file, FILE_SHARE_READ, &status)) {
        if ((i == 1 || i == 2) && status == static_cast<NTSTATUS>(0xC0000034L)) continue;
        return 2;
      }
      slots[i].present = true;
      Identity info;
      unsigned char digest[32]{};
      if (!snapshot(slots[i].file.value, info, digest)) return 2;
    }
  }
  std::vector<std::string> recoveryFields;
  if (recovering) std::printf("RECOVERY_READY\t%s\t%u", generation.c_str(), sequence);
  else std::printf("READY\t%s", generation.c_str());
  for (const auto& slot : slots) {
    std::printf("\t%s=", slot.key);
    if (recovering) {
      std::string field = std::string(slot.key) + "=";
      if (slot.present) {
        Identity info;
        unsigned char digest[32]{};
        if (!snapshot(slot.file.value, info, digest)) return 2;
        char volume[17]{}, bytes[32]{};
        std::snprintf(volume, sizeof(volume), "%016llx", info.id.VolumeSerialNumber);
        std::snprintf(bytes, sizeof(bytes), "%llu", info.bytes);
        field += encodeName(slot.currentName) + ":" + volume + ":" + ascii(fileIdHex(info)) +
          ":" + bytes + ":" + ascii(digestHex(digest));
      } else field += "-";
      recoveryFields.push_back(field);
      std::printf("%s", field.c_str() + std::strlen(slot.key) + 1);
    } else if (slot.present) printSnapshot(slot.file.value);
    else std::printf("-");
  }
  std::printf("\n");
  std::fflush(stdout);
  bool accepted = !recovering;
  bool emptyGuarded = false;
  bool rollbackCommitted = false;
  std::wstring blobRootPath, blobParentRelative;
  std::vector<Handle> blobRoot, blobParents, blobReservations;
  Identity blobRootId, blobParentId;
  std::vector<TwoBlobGuardItem> twoBlobGuards;
  bool twoBlobGuardStarted = false;
  bool twoBlobGuardReady = false;
  std::string line;
  while (readSessionLine(line)) {
    const auto fields = splitTabs(line);
    if (fields.empty()) return 2;
    if (!sidecarsStillOwned(root.back().value, dbName, slots)) return 2;
    if (!accepted) {
      if (fields.size() != 7 || fields[0] != "ACCEPT" || fields[1] != generation ||
          fields[2] != std::to_string(sequence)) return 2;
      for (size_t i = 0; i < 4; ++i) if (fields[i + 3] != recoveryFields[i]) return 2;
      accepted = true;
      std::printf("ACCEPTED\t%s\t%u\n", generation.c_str(), sequence);
      std::fflush(stdout);
      continue;
    }
    if (fields.size() == 2 && fields[0] == "GUARD_BEGIN" && fields[1] == "2" && recovering &&
        sequence == 0 && !emptyGuarded && !twoBlobGuardStarted && slots[0].present && slots[3].present &&
        slots[0].currentName == dbName && slots[3].currentName == stagedName) {
      twoBlobGuardStarted = true;
      std::puts("GUARD_BEGIN_OK\t2"); std::fflush(stdout); continue;
    }
    if (twoBlobGuardStarted && fields.size() == 15 && fields[0] == "GUARD_ITEM" && !twoBlobGuardReady &&
        fields[1] == std::to_string(twoBlobGuards.size()) && twoBlobGuards.size() < 2 && line.size() <= 8192) {
      TwoBlobGuardItem item;
      std::wstring destination, stage;
      if (!decodeUtf16Hex(fields[2], item.rootPath) ||
          !decodeName(std::wstring(fields[4].begin(), fields[4].end()), destination) ||
          !decodeName(std::wstring(fields[5].begin(), fields[5].end()), stage) ||
          stage.size() <= destination.size() + 13 ||
          stage.compare(0, destination.size(), destination) != 0 ||
          stage.compare(destination.size(), 9, L".restore-") != 0 ||
          stage.compare(stage.size() - 4, 4, L".tmp") != 0 ||
          !uuidAtEnd(stage.substr(0, stage.size() - 4), destination + L".restore-")) return 2;
      item.names[0] = destination;
      item.names[1] = stage;
      item.names[2] = stage + L".pending";
      if (fields[3] != "-" && !decodeUtf16Hex(fields[3], item.parentRelative)) return 2;
      if (!openAbsolute(item.rootPath, true, FILE_READ_ATTRIBUTES, item.root) ||
          !identity(item.root.back().value, item.rootId) ||
          !expectedRoot(item.rootId, std::wstring(fields[6].begin(), fields[6].end()).c_str(),
            std::wstring(fields[7].begin(), fields[7].end()).c_str())) return 2;
      if (!twoBlobGuards.empty() &&
          (CompareStringOrdinal(item.rootPath.c_str(), -1, twoBlobGuards[0].rootPath.c_str(), -1, TRUE) != CSTR_EQUAL ||
           !sameFileId(item.rootId, twoBlobGuards[0].rootId))) return 2;
      HANDLE parent = item.root.back().value;
      if (!item.parentRelative.empty()) {
        std::wstring ignored;
        std::vector<std::wstring> parts;
        if (!splitPath(item.parentRelative, false, ignored, parts)) return 2;
        for (const auto& part : parts) {
          Handle next;
          if (!openChild(parent, part, true, false, FILE_READ_ATTRIBUTES, next)) return 2;
          item.parents.push_back(std::move(next));
          parent = item.parents.back().value;
        }
      }
      if (!identity(parent, item.parentId) ||
          !expectedRoot(item.parentId, std::wstring(fields[8].begin(), fields[8].end()).c_str(),
            std::wstring(fields[9].begin(), fields[9].end()).c_str())) return 2;
      for (const auto& earlier : twoBlobGuards) {
        if (!sameFileId(item.parentId, earlier.parentId)) continue;
        for (const auto& name : item.names) for (const auto& prior : earlier.names) {
          if (CompareStringOrdinal(name.c_str(), -1, prior.c_str(), -1, TRUE) == CSTR_EQUAL) return 2;
        }
      }
      const bool stageOwned = fields[10] == "stage";
      const bool destinationOwned = fields[10] == "destination";
      if (!stageOwned && !destinationOwned && fields[10] != "none") return 2;
      if (stageOwned || destinationOwned) {
        const auto& name = stageOwned ? item.names[1] : item.names[0];
        if (!openChild(parent, name, false, false, GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE,
            item.owned, 0) || !snapshot(item.owned.value, item.ownedId, item.ownedDigest) ||
            item.ownedId.links != 1) return 2;
        char serial[17]{};
        std::snprintf(serial, sizeof(serial), "%016llx", item.ownedId.id.VolumeSerialNumber);
        if (fields[11] != serial || fields[12] != ascii(fileIdHex(item.ownedId)) ||
            fields[13] != std::to_string(item.ownedId.bytes) ||
            fields[14] != ascii(digestHex(item.ownedDigest))) return 2;
        item.hasOwned = true;
      } else if (fields[11] != "-" || fields[12] != "-" || fields[13] != "-" || fields[14] != "-") return 2;
      for (size_t i = 0; i < 3; ++i) {
        if ((stageOwned && i == 1) || (destinationOwned && i == 0)) continue;
        Handle reserved;
        if (!openChild(parent, item.names[i], false, true,
            GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE,
            reserved, 0, nullptr, FILE_DELETE_ON_CLOSE)) return 2;
        item.reserved.push_back(std::move(reserved));
      }
      twoBlobGuards.push_back(std::move(item));
      std::printf("GUARD_ITEM_OK\t%zu\n", twoBlobGuards.size() - 1); std::fflush(stdout); continue;
    }
    if (twoBlobGuardStarted && fields.size() == 1 && fields[0] == "GUARD_FINAL" &&
        !twoBlobGuardReady && twoBlobGuards.size() == 2) {
      for (auto& item : twoBlobGuards) {
        std::vector<Handle> observedRoot, observedParent;
        Identity observed;
        if (!openAbsolute(item.rootPath, true, FILE_READ_ATTRIBUTES, observedRoot) ||
            !identity(observedRoot.back().value, observed) || !sameFileId(observed, item.rootId)) return 2;
        HANDLE parent = observedRoot.back().value;
        if (!item.parentRelative.empty()) {
          std::wstring ignored;
          std::vector<std::wstring> parts;
          if (!splitPath(item.parentRelative, false, ignored, parts)) return 2;
          for (const auto& part : parts) {
            Handle next;
            if (!openChild(parent, part, true, false, FILE_READ_ATTRIBUTES, next)) return 2;
            observedParent.push_back(std::move(next));
            parent = observedParent.back().value;
          }
        }
        if (!identity(parent, observed) || !sameFileId(observed, item.parentId)) return 2;
        if (item.hasOwned) {
          Identity owned;
          unsigned char digest[32]{};
          if (!snapshot(item.owned.value, owned, digest) || !sameIdentity(owned, item.ownedId) ||
              std::memcmp(digest, item.ownedDigest, 32) != 0) return 2;
        }
      }
      for (auto& slot : slots) {
        if (!slot.present) continue;
        Handle current;
        Identity pinned, observed;
        unsigned char pinnedHash[32]{}, observedHash[32]{};
        if (!openChild(root.back().value, slot.currentName, false, false,
            GENERIC_READ | FILE_READ_ATTRIBUTES, current, FILE_SHARE_READ | FILE_SHARE_DELETE) ||
            !snapshot(slot.file.value, pinned, pinnedHash) || !snapshot(current.value, observed, observedHash) ||
            !sameIdentity(pinned, observed) || std::memcmp(pinnedHash, observedHash, 32) != 0) return 2;
      }
      twoBlobGuardReady = true;
      std::puts("GUARD_READY\t2"); std::fflush(stdout); continue;
    }
    if (twoBlobGuardStarted && (fields.size() != 1 || fields[0] != "CLOSE" || !twoBlobGuardReady)) return 2;
    const bool ownedGuard = fields[0] == "OWNED_GUARD";
    if ((fields[0] == "EMPTY_GUARD" || ownedGuard) && fields.size() == (ownedGuard ? 13 : 9) && recovering &&
        sequence == 0 && !emptyGuarded && slots[0].present && slots[3].present &&
        slots[0].currentName == dbName && slots[3].currentName == stagedName) {
      std::wstring destination, stage;
      if (!decodeUtf16Hex(fields[1], blobRootPath) ||
          !decodeName(std::wstring(fields[3].begin(), fields[3].end()), destination) ||
          !decodeName(std::wstring(fields[4].begin(), fields[4].end()), stage) ||
          stage.size() <= destination.size() + 13 ||
          stage.compare(0, destination.size(), destination) != 0 ||
          stage.compare(destination.size(), 9, L".restore-") != 0 ||
          stage.compare(stage.size() - 4, 4, L".tmp") != 0 ||
          !uuidAtEnd(stage.substr(0, stage.size() - 4), destination + L".restore-")) return 2;
      if (!openAbsolute(blobRootPath, true, FILE_READ_ATTRIBUTES, blobRoot) ||
          !identity(blobRoot.back().value, blobRootId) ||
          !expectedRoot(blobRootId,
            std::wstring(fields[5].begin(), fields[5].end()).c_str(),
            std::wstring(fields[6].begin(), fields[6].end()).c_str())) return 2;
      HANDLE parent = blobRoot.back().value;
      if (fields[2] != "-") {
        if (!decodeUtf16Hex(fields[2], blobParentRelative)) return 2;
        std::wstring ignored;
        std::vector<std::wstring> parts;
        if (!splitPath(blobParentRelative, false, ignored, parts)) return 2;
        for (const auto& part : parts) {
          Handle next;
          if (!openChild(parent, part, true, false, FILE_READ_ATTRIBUTES, next)) return 2;
          blobParents.push_back(std::move(next));
          parent = blobParents.back().value;
        }
      }
      if (!identity(parent, blobParentId) ||
          !expectedRoot(blobParentId,
            std::wstring(fields[7].begin(), fields[7].end()).c_str(),
            std::wstring(fields[8].begin(), fields[8].end()).c_str())) return 2;
      Handle owned;
      std::wstring ownedName;
      if (ownedGuard) {
        constexpr NTSTATUS missing = static_cast<NTSTATUS>(0xc0000034L); // STATUS_OBJECT_NAME_NOT_FOUND
        NTSTATUS status = 0;
        if (openChild(parent, stage, false, false, GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE,
            owned, 0, &status)) ownedName = stage;
        else if (status != missing) return 2;
        else if (openChild(parent, destination, false, false, GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE,
            owned, 0, &status)) ownedName = destination;
        else if (status != missing) return 2;
        if (!ownedName.empty()) {
          Identity found;
          unsigned char digest[32]{};
          char serial[17]{};
          if (!snapshot(owned.value, found, digest) || found.links != 1) return 2;
          std::snprintf(serial, sizeof(serial), "%016llx", found.id.VolumeSerialNumber);
          if (fields[9] != serial || fields[10] != ascii(fileIdHex(found)) ||
              fields[11] != std::to_string(found.bytes) || fields[12] != ascii(digestHex(digest))) return 2;
        }
      }
      for (const auto& name : { destination, stage, stage + L".pending" }) {
        if (name == ownedName) continue;
        Handle reserved;
        if (!openChild(parent, name, false, true,
            GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE,
            reserved, 0, nullptr, FILE_DELETE_ON_CLOSE)) return 2;
        blobReservations.push_back(std::move(reserved));
      }
      if (!ownedName.empty()) {
        // No delete-on-close access was requested before FileId/hash/links and
        // the other two names were checked. This held share-zero handle owns
        // the exact verified name until the journal terminal flush or crash.
        FILE_DISPOSITION_INFO disposition{TRUE};
        if (!SetFileInformationByHandle(owned.value, FileDispositionInfo,
            &disposition, sizeof(disposition))) return 2;
        blobReservations.push_back(std::move(owned));
#ifdef AITEST_FAULT_FIXTURE
        wchar_t haltAfterDisposition[2]{};
        if (GetEnvironmentVariableW(L"AITEST_NATIVE_OWNED_HALT_AFTER_DISPOSITION",
            haltAfterDisposition, 2) == 1 && haltAfterDisposition[0] == L'1') {
          wchar_t markerPath[32768]{};
          const DWORD length = GetEnvironmentVariableW(L"AITEST_NATIVE_OWNED_DISPOSITION_MARKER",
            markerPath, static_cast<DWORD>(std::size(markerPath)));
          if (length == 0 || length >= std::size(markerPath)) return 2;
          Handle marker(CreateFileW(markerPath, GENERIC_WRITE, 0, nullptr, CREATE_NEW,
            FILE_ATTRIBUTE_NORMAL, nullptr));
          if (marker.value == INVALID_HANDLE_VALUE || !FlushFileBuffers(marker.value)) return 2;
          Sleep(INFINITE);
        }
#endif
      }
      emptyGuarded = true;
      std::puts(ownedGuard ? "OWNED_GUARDED" : "EMPTY_GUARDED"); std::fflush(stdout); continue;
    }
    if (fields[0] == "ROLLBACK_COMMIT" && fields.size() == 7 && emptyGuarded &&
        !rollbackCommitted && sequence == 0) {
      std::wstring journalPath;
      std::string terminalLine;
      if (!decodeUtf16Hex(fields[1], journalPath) ||
          journalPath != std::wstring(argv[2]) + L"\\" + dbName + L".restore-journal.jsonl" ||
          !decodeBytesHex(fields[6], terminalLine) || terminalLine.empty() ||
          terminalLine.back() != '\n' ||
          terminalLine.find('\n') != terminalLine.size() - 1) return 2;
      std::vector<Handle> observedRoot, observedParent, journal;
      Identity found;
      if (!openAbsolute(blobRootPath, true, FILE_READ_ATTRIBUTES, observedRoot) ||
          !identity(observedRoot.back().value, found) || !sameFileId(found, blobRootId)) return 2;
      HANDLE parent = observedRoot.back().value;
      if (!blobParentRelative.empty()) {
        std::wstring ignored;
        std::vector<std::wstring> parts;
        if (!splitPath(blobParentRelative, false, ignored, parts)) return 2;
        for (const auto& part : parts) {
          Handle next;
          if (!openChild(parent, part, true, false, FILE_READ_ATTRIBUTES, next)) return 2;
          observedParent.push_back(std::move(next));
          parent = observedParent.back().value;
        }
      }
      if (!identity(parent, found) || !sameFileId(found, blobParentId)) return 2;
      for (auto& slot : slots) {
        if (!slot.present) continue;
        Handle current;
        Identity pinned, observed;
        unsigned char pinnedHash[32]{}, observedHash[32]{};
        if (!openChild(root.back().value, slot.currentName, false, false,
            GENERIC_READ | FILE_READ_ATTRIBUTES, current, FILE_SHARE_READ | FILE_SHARE_DELETE) ||
            !snapshot(slot.file.value, pinned, pinnedHash) || !snapshot(current.value, observed, observedHash) ||
            !sameIdentity(pinned, observed) || std::memcmp(pinnedHash, observedHash, 32) != 0) return 2;
      }
      Identity journalId;
      unsigned char journalHash[32]{};
      if (!openAbsolute(journalPath, false, GENERIC_READ | FILE_APPEND_DATA, journal, FILE_SHARE_READ) ||
          !snapshot(journal.back().value, journalId, journalHash)) return 2;
      char serial[17]{};
      std::snprintf(serial, sizeof(serial), "%016llx", journalId.id.VolumeSerialNumber);
      if (fields[2] != serial || fields[3] != ascii(fileIdHex(journalId)) ||
          fields[4] != std::to_string(journalId.bytes) ||
          fields[5] != ascii(digestHex(journalHash))) return 2;
      DWORD written = 0;
      if (!WriteFile(journal.back().value, terminalLine.data(), static_cast<DWORD>(terminalLine.size()),
            &written, nullptr) || written != terminalLine.size() ||
          !FlushFileBuffers(journal.back().value)) return 2;
      rollbackCommitted = true;
#ifdef AITEST_FAULT_FIXTURE
      wchar_t haltAfterFlush[2]{};
      if (GetEnvironmentVariableW(L"AITEST_NATIVE_EMPTY_ROLLBACK_HALT_AFTER_FLUSH", haltAfterFlush, 2) == 1 &&
          haltAfterFlush[0] == L'1') {
        wchar_t markerPath[32768]{};
        const DWORD length = GetEnvironmentVariableW(L"AITEST_NATIVE_EMPTY_ROLLBACK_FLUSH_MARKER",
          markerPath, static_cast<DWORD>(std::size(markerPath)));
        if (length == 0 || length >= std::size(markerPath)) return 2;
        Handle marker(CreateFileW(markerPath, GENERIC_WRITE, 0, nullptr, CREATE_NEW,
          FILE_ATTRIBUTE_NORMAL, nullptr));
        if (marker.value == INVALID_HANDLE_VALUE || !FlushFileBuffers(marker.value)) return 2;
        Sleep(INFINITE);
      }
#endif
      std::puts("ROLLBACK_COMMITTED"); std::fflush(stdout); continue;
    }
    if (fields.size() == 1 && fields[0] == "CLOSE") {
      if (emptyGuarded && !rollbackCommitted) return 2;
      const bool sidecarsAtOrigin = (!slots[1].present || slots[1].currentName == dbName + L"-wal") &&
        (!slots[2].present || slots[2].currentName == dbName + L"-shm");
      const bool sidecarsPreserved = (!slots[1].present || slots[1].currentName == dbName + L"-wal" + preservedSuffix) &&
        (!slots[2].present || slots[2].currentName == dbName + L"-shm" + preservedSuffix);
      const bool rolledBack = (sequence > 0 || (recovering && accepted)) && slots[0].currentName == dbName &&
        slots[3].currentName == stagedName && sidecarsAtOrigin;
      const bool verifiedPublished = !preservedSuffix.empty() && slots[0].currentName == dbName + preservedSuffix &&
        slots[3].currentName == dbName && slots[3].readGuard && sidecarsPreserved;
      if (!rolledBack && !verifiedPublished) return 2;
      std::printf("CLOSED\t%s\t%u\n", generation.c_str(), sequence);
      std::fflush(stdout);
      return 0;
    }
    if (fields.size() == 1 && fields[0] == "VERIFY") {
      SessionSlot& published = slots[3];
      if (!published.present || published.readGuard || published.currentName != dbName ||
          preservedSuffix.empty() || slots[0].currentName != dbName + preservedSuffix ||
          (slots[1].present && slots[1].currentName != dbName + L"-wal" + preservedSuffix) ||
          (slots[2].present && slots[2].currentName != dbName + L"-shm" + preservedSuffix)) return 2;
      Handle reader;
      if (!openChild(root.back().value, published.currentName, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES, reader, FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
      Identity before, after;
      unsigned char sourceDigest[32]{}, readerDigest[32]{};
      if (!snapshot(published.file.value, before, sourceDigest) ||
          !snapshot(reader.value, after, readerDigest) || !sameIdentity(before, after) ||
          std::memcmp(sourceDigest, readerDigest, 32) != 0) return 2;
      published.file = std::move(reader);
      published.readGuard = true;
      std::printf("VERIFY_READY\t%s\t%u\t", generation.c_str(), sequence);
      printSnapshot(published.file.value);
      std::printf("\n");
      std::fflush(stdout);
      continue;
    }
    if (fields.size() != 8 || fields[0] != "MOVE") return 2;
    SessionSlot* slot = nullptr;
    for (auto& item : slots) if (fields[1] == item.key) slot = &item;
    if (!slot || !slot->present) return 2;
    std::wstring fromName, toName;
    if (!decodeName(std::wstring(fields[2].begin(), fields[2].end()), fromName) ||
        !decodeName(std::wstring(fields[3].begin(), fields[3].end()), toName) ||
        fromName != slot->currentName || fromName == toName) return 2;
    if (slot == &slots[0]) {
      if (fromName == dbName) {
        const std::wstring prefix = dbName + L".restore-old-";
        if (!preservedSuffix.empty() || !uuidAtEnd(toName, prefix) || slots[3].currentName != stagedName) return 2;
        preservedSuffix = toName.substr(dbName.size());
      } else if (preservedSuffix.empty() || fromName != dbName + preservedSuffix || toName != dbName ||
                 slots[3].currentName != stagedName ||
                 (slots[1].present && slots[1].currentName != dbName + L"-wal") ||
                 (slots[2].present && slots[2].currentName != dbName + L"-shm")) return 2;
    } else if (slot == &slots[1] || slot == &slots[2]) {
      const std::wstring original = dbName + (slot == &slots[1] ? L"-wal" : L"-shm");
      if (preservedSuffix.empty() || slots[0].currentName != dbName + preservedSuffix ||
          slots[3].currentName != stagedName) return 2;
      if (fromName == original) {
        if (toName != original + preservedSuffix ||
            (slot == &slots[2] && slots[1].present && slots[1].currentName != dbName + L"-wal" + preservedSuffix)) return 2;
      } else if (fromName != original + preservedSuffix || toName != original ||
                 (slot == &slots[1] && slots[2].present && slots[2].currentName != dbName + L"-shm")) return 2;
    } else if (slot == &slots[3]) {
      if (preservedSuffix.empty() || slots[0].currentName != dbName + preservedSuffix) return 2;
      if (fromName == stagedName) {
        if (toName != dbName ||
            (slots[1].present && slots[1].currentName != dbName + L"-wal" + preservedSuffix) ||
            (slots[2].present && slots[2].currentName != dbName + L"-shm" + preservedSuffix)) return 2;
      } else if (fromName != dbName || toName != stagedName) return 2;
    }
    if (slot->readGuard) {
      Handle renameHandle;
      if (!openChild(root.back().value, fromName, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, renameHandle, FILE_SHARE_READ)) return 2;
      Identity held, reopened;
      if (!identity(slot->file.value, held) || !identity(renameHandle.value, reopened) ||
          !sameIdentity(held, reopened)) return 2;
      slot->file = std::move(renameHandle);
      slot->readGuard = false;
    }
    Identity before, after;
    unsigned char digest[32]{}, afterDigest[32]{};
    if (!snapshot(slot->file.value, before, digest)) return 2;
    char volume[17]{};
    std::snprintf(volume, sizeof(volume), "%016llx", before.id.VolumeSerialNumber);
    if (fields[4] != volume || fields[5] != ascii(fileIdHex(before)) ||
        fields[6] != std::to_string(before.bytes) || fields[7] != ascii(digestHex(digest))) return 2;
    if (!renameHeld(slot->file.value, root.back().value, toName) ||
        !snapshot(slot->file.value, after, afterDigest) || !sameIdentity(before, after) ||
        std::memcmp(digest, afterDigest, 32) != 0) return 2;
    slot->currentName = toName;
    ++sequence;
    std::printf("MOVED\t%s\t%u\t%s\t%s\t%s\t", generation.c_str(), sequence,
      slot->key, encodeName(fromName).c_str(), encodeName(toName).c_str());
    printSnapshot(slot->file.value);
    std::printf("\t");
    printSnapshot(slot->file.value);
    std::printf("\n");
    std::fflush(stdout);
  }
  return 2; // EOF before CLOSE is a failed session; journal recovery remains nonterminal.
}

// A fresh target has no old generation to pin. Keep its protocol separate from
// the existing-target session so an absent old DB cannot weaken that contract.
int freshRestoreSession(int argc, wchar_t** argv, bool recovering) {
  if (argc != (recovering ? 7 : 6)) return 2;
  std::wstring dbName, stagedName, preservedName;
  if (!decodeName(argv[3], dbName) || !decodeName(argv[4], stagedName) ||
      !uuidAtEnd(stagedName, dbName + L".restore-")) return 2;
  if (recovering && (!decodeName(argv[5], preservedName) ||
      !uuidAtEnd(preservedName, dbName + L".restore-old-"))) return 2;
  const std::string generation = ascii(argv[recovering ? 6 : 5]);
  if (generation.size() != 36) return 2;
  for (char c : generation) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || c == '-')) return 2;
  std::vector<Handle> root;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  auto absent = [&](const std::wstring& name) -> bool {
    NTSTATUS status = 0;
    Handle observed;
    return !openChild(root.back().value, name, false, false,
      GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, observed, FILE_SHARE_READ, &status) &&
      status == static_cast<NTSTATUS>(0xC0000034L);
  };
  if (!absent(dbName + L"-wal") || !absent(dbName + L"-shm") ||
      (recovering && (!absent(preservedName) || !absent(dbName + L"-wal" + preservedName.substr(dbName.size())) ||
        !absent(dbName + L"-shm" + preservedName.substr(dbName.size()))))) return 2;
  SessionSlot staged{ "stagedDb", stagedName, Handle{} };
  auto openAt = [&](const std::wstring& name) -> int {
    NTSTATUS status = 0;
    Handle held;
    if (!openChild(root.back().value, name, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, held, FILE_SHARE_READ, &status)) {
      return status == static_cast<NTSTATUS>(0xC0000034L) ? 0 : -1;
    }
    Identity info;
    unsigned char digest[32]{};
    if (!snapshot(held.value, info, digest)) return -1;
    staged.file = std::move(held);
    staged.currentName = name;
    staged.present = true;
    return 1;
  };
  const int atStage = openAt(stagedName);
  if (atStage < 0 || (atStage == 0 && (!recovering || openAt(dbName) != 1)) ||
      (atStage == 1 && !absent(dbName)) || (atStage == 0 && !absent(stagedName))) return 2;
  unsigned sequence = atStage == 0 ? 1U : 0U;
  std::string readyField = "stagedDb=";
  Identity initial;
  unsigned char initialDigest[32]{};
  if (!snapshot(staged.file.value, initial, initialDigest)) return 2;
  char volume[17]{}, bytes[32]{};
  std::snprintf(volume, sizeof(volume), "%016llx", initial.id.VolumeSerialNumber);
  std::snprintf(bytes, sizeof(bytes), "%llu", initial.bytes);
  readyField += encodeName(staged.currentName) + ":" + volume + ":" + ascii(fileIdHex(initial)) +
    ":" + bytes + ":" + ascii(digestHex(initialDigest));
  if (recovering) std::printf("RECOVERY_READY\t%s\t%u\toldDb=-\toldWal=-\toldShm=-\t%s\n",
    generation.c_str(), sequence, readyField.c_str());
  else {
    std::printf("READY\t%s\toldDb=-\toldWal=-\toldShm=-\tstagedDb=", generation.c_str());
    printSnapshot(staged.file.value);
    std::printf("\n");
  }
  std::fflush(stdout);
  bool accepted = !recovering;
  std::string line;
  while (std::getline(std::cin, line)) {
    const auto fields = splitTabs(line);
    if (!absent(dbName + L"-wal") || !absent(dbName + L"-shm")) return 2;
    if (!accepted) {
      if (fields.size() != 7 || fields[0] != "ACCEPT" || fields[1] != generation ||
          fields[2] != std::to_string(sequence) || fields[3] != "oldDb=-" ||
          fields[4] != "oldWal=-" || fields[5] != "oldShm=-" || fields[6] != readyField) return 2;
      accepted = true;
      std::printf("ACCEPTED\t%s\t%u\n", generation.c_str(), sequence);
      std::fflush(stdout);
      continue;
    }
    if (fields.size() == 1 && fields[0] == "CLOSE") {
      if (!(staged.currentName == stagedName ||
          (staged.currentName == dbName && staged.readGuard))) return 2;
      if (staged.currentName == stagedName && !absent(dbName)) return 2;
      std::printf("CLOSED\t%s\t%u\n", generation.c_str(), sequence);
      std::fflush(stdout);
      return 0;
    }
    if (fields.size() == 1 && fields[0] == "VERIFY") {
      if (staged.currentName != dbName || staged.readGuard || !absent(stagedName)) return 2;
      Handle reader;
      if (!openChild(root.back().value, dbName, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES, reader, FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
      Identity before, after;
      unsigned char sourceDigest[32]{}, readerDigest[32]{};
      if (!snapshot(staged.file.value, before, sourceDigest) || !snapshot(reader.value, after, readerDigest) ||
          !sameIdentity(before, after) || std::memcmp(sourceDigest, readerDigest, 32) != 0) return 2;
      staged.file = std::move(reader);
      staged.readGuard = true;
      std::printf("VERIFY_READY\t%s\t%u\t", generation.c_str(), sequence);
      printSnapshot(staged.file.value);
      std::printf("\n");
      std::fflush(stdout);
      continue;
    }
    if (fields.size() != 8 || fields[0] != "MOVE" || fields[1] != "stagedDb") return 2;
    std::wstring fromName, toName;
    if (!decodeName(std::wstring(fields[2].begin(), fields[2].end()), fromName) ||
        !decodeName(std::wstring(fields[3].begin(), fields[3].end()), toName) ||
        fromName != staged.currentName ||
        !((fromName == stagedName && toName == dbName) || (fromName == dbName && toName == stagedName))) return 2;
    if (staged.readGuard) {
      Handle renameHandle;
      if (!openChild(root.back().value, fromName, false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, renameHandle, FILE_SHARE_READ)) return 2;
      Identity held, reopened;
      if (!identity(staged.file.value, held) || !identity(renameHandle.value, reopened) ||
          !sameIdentity(held, reopened)) return 2;
      staged.file = std::move(renameHandle);
      staged.readGuard = false;
    }
    Identity before, after;
    unsigned char digest[32]{}, afterDigest[32]{};
    if (!snapshot(staged.file.value, before, digest)) return 2;
    char currentVolume[17]{};
    std::snprintf(currentVolume, sizeof(currentVolume), "%016llx", before.id.VolumeSerialNumber);
    if (fields[4] != currentVolume || fields[5] != ascii(fileIdHex(before)) ||
        fields[6] != std::to_string(before.bytes) || fields[7] != ascii(digestHex(digest))) return 2;
    if (!renameHeld(staged.file.value, root.back().value, toName) ||
        !snapshot(staged.file.value, after, afterDigest) || !sameIdentity(before, after) ||
        std::memcmp(digest, afterDigest, 32) != 0) return 2;
    staged.currentName = toName;
    ++sequence;
    std::printf("MOVED\t%s\t%u\tstagedDb\t%s\t%s\t", generation.c_str(), sequence,
      encodeName(fromName).c_str(), encodeName(toName).c_str());
    printSnapshot(staged.file.value);
    std::printf("\t");
    printSnapshot(staged.file.value);
    std::printf("\n");
    std::fflush(stdout);
  }
  return 2;
}

// GC primitive: the row must already be DELETED before this command starts.
// The held file handle, not the mutable absolute path, selects the file to unlink.
int deleteOwnedSession(int argc, wchar_t** argv) {
  if (argc != 10) return 2;
  std::vector<Handle> root, file;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  Identity pinnedRoot;
  if (!identity(root.back().value, pinnedRoot)) return 2;
  char rootVolume[17]{};
  std::snprintf(rootVolume, sizeof(rootVolume), "%016llx", pinnedRoot.id.VolumeSerialNumber);
  if (ascii(argv[8]) != rootVolume || ascii(argv[9]) != ascii(fileIdHex(pinnedRoot)) ||
      !openRelative(root.back().value, argv[3], false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, file, false,
        FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
  Identity before;
  unsigned char digest[32]{};
  if (!snapshot(file.back().value, before, digest)) return 2;
  char volume[17]{};
  std::snprintf(volume, sizeof(volume), "%016llx", before.id.VolumeSerialNumber);
  if (ascii(argv[4]) != volume || ascii(argv[5]) != ascii(fileIdHex(before)) ||
      ascii(argv[6]) != std::to_string(before.bytes) || ascii(argv[7]) != ascii(digestHex(digest))) return 2;
  std::printf("DELETE_READY\t%s\t%s\t%llu\t%s\n", volume, ascii(fileIdHex(before)).c_str(),
    before.bytes, ascii(digestHex(digest)).c_str());
  std::fflush(stdout);
  std::string line;
  if (!std::getline(std::cin, line) || line != "DELETE") return 2;
  Identity current;
  unsigned char currentDigest[32]{};
  if (!snapshot(file.back().value, current, currentDigest) || !sameIdentity(before, current) ||
      std::memcmp(digest, currentDigest, 32) != 0) return 2;
  FILE_DISPOSITION_INFO disposition{};
  disposition.DeleteFile = TRUE;
  IO_STATUS_BLOCK io{};
  constexpr auto dispositionClass = static_cast<FILE_INFORMATION_CLASS>(13); // FileDispositionInformation
  if (NtSetInformationFile(file.back().value, &io, &disposition,
      static_cast<ULONG>(sizeof(disposition)), dispositionClass) < 0) return 2;
  if (wcscmp(argv[1], L"delete-owned-probe") == 0) {
    std::puts("DISPOSITION_SET");
    std::fflush(stdout);
    if (!std::getline(std::cin, line) || line != "RECEIPT") return 2;
  }
  std::printf("DELETED\t%s\t%s\n", volume, ascii(fileIdHex(before)).c_str());
  std::fflush(stdout);
  return 0;
}

// Restore blob operations: each request pins its root and every path component.
// The caller supplies the root identity captured before the restore began.
bool expectedRoot(const Identity& actual, const wchar_t* volume, const wchar_t* id) {
  char serial[17]{};
  std::snprintf(serial, sizeof(serial), "%016llx", actual.id.VolumeSerialNumber);
  return ascii(volume) == serial && ascii(id) == ascii(fileIdHex(actual));
}

int copyOwned(int argc, wchar_t** argv) {
  if (argc != 10) return 2;
  std::vector<Handle> sourceRoot, source, targetRoot, target;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, sourceRoot) ||
      !openAbsolute(argv[4], true, FILE_READ_ATTRIBUTES, targetRoot)) return 2;
  Identity sourceRootId, targetRootId;
  if (!identity(sourceRoot.back().value, sourceRootId) ||
      !identity(targetRoot.back().value, targetRootId) ||
      !expectedRoot(sourceRootId, argv[6], argv[7]) ||
      !expectedRoot(targetRootId, argv[8], argv[9]) ||
      sourceRootId.id.VolumeSerialNumber != targetRootId.id.VolumeSerialNumber) return 2;
  if (!openRelative(sourceRoot.back().value, argv[3], false,
      GENERIC_READ | FILE_READ_ATTRIBUTES, source, false, FILE_SHARE_READ)) return 2;
  Identity sourceBefore;
  if (!identity(source.back().value, sourceBefore) || sourceBefore.links != 1) return 2;
  std::puts("COPY_READY");
  std::fflush(stdout);
  std::string line;
  if (!std::getline(std::cin, line) || line != "COPY" ||
      !openRelative(targetRoot.back().value, argv[5], true,
        GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE, target, true, 0)) return 2;
#ifdef AITEST_FAULT_FIXTURE
  wchar_t oldFault[2]{};
  if (GetEnvironmentVariableW(L"AITEST_NATIVE_OLD_COPY_HALT_AFTER_CREATE", oldFault, 2) == 1 &&
      oldFault[0] == L'1') { std::puts("CREATED_OLD"); std::fflush(stdout); Sleep(INFINITE); }
#endif
  unsigned char copiedDigest[32]{}, targetDigest[32]{};
  unsigned long long copied = 0;
  Identity targetId, sourceAfter;
  CopyFault oldFaultMode = CopyFault::None;
#ifdef AITEST_FAULT_FIXTURE
  if (fixtureFaultRequested(L"AITEST_NATIVE_OLD_COPY_HALT_AFTER_PARTIAL_WRITE", argv[4]))
    oldFaultMode = CopyFault::HaltAfterFirstWrite;
#endif
  if (!copyHeld(source.back().value, target.back().value, copiedDigest, copied, oldFaultMode) ||
      !identity(target.back().value, targetId) || targetId.bytes != copied ||
      !identity(source.back().value, sourceAfter) || !sameIdentity(sourceBefore, sourceAfter) ||
      !hashHeld(target.back().value, targetDigest) ||
      std::memcmp(copiedDigest, targetDigest, 32) != 0) {
    FILE_DISPOSITION_INFO disposition{TRUE};
    SetFileInformationByHandle(target.back().value, FileDispositionInfo, &disposition, sizeof(disposition));
    return 2;
  }
  printIdentity(targetId, copiedDigest);
  return 0;
}

int copyStageSession(int argc, wchar_t** argv) {
  if (argc != 10) return 2;
  std::wstring ignored;
  std::vector<std::wstring> stageParts;
  if (!splitPath(argv[5], false, ignored, stageParts) ||
      stageParts.back().size() > 247) return 2;
  std::wstring pendingRelative(argv[5]);
  pendingRelative += L".pending";
  std::vector<Handle> sourceRoot, source, targetRoot, pending;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, sourceRoot) ||
      !openAbsolute(argv[4], true, FILE_READ_ATTRIBUTES, targetRoot)) return 2;
  Identity sourceRootId, targetRootId, sourceBefore;
  if (!identity(sourceRoot.back().value, sourceRootId) ||
      !identity(targetRoot.back().value, targetRootId) ||
      !expectedRoot(sourceRootId, argv[6], argv[7]) ||
      !expectedRoot(targetRootId, argv[8], argv[9]) ||
      sourceRootId.id.VolumeSerialNumber != targetRootId.id.VolumeSerialNumber ||
      !openRelative(sourceRoot.back().value, argv[3], false,
        GENERIC_READ | FILE_READ_ATTRIBUTES, source, false, FILE_SHARE_READ) ||
      !identity(source.back().value, sourceBefore) || sourceBefore.links != 1) return 2;
  std::puts("COPY_READY"); std::fflush(stdout);
  std::string line;
  if (!std::getline(std::cin, line) || line != "COPY" ||
      !openRelative(targetRoot.back().value, pendingRelative, true,
        GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE,
        pending, true, 0, FILE_DELETE_ON_CLOSE)) return 2;
#ifdef AITEST_FAULT_FIXTURE
  wchar_t fault[2]{};
  if (GetEnvironmentVariableW(L"AITEST_NATIVE_STAGE_HALT_AFTER_CREATE", fault, 2) == 1 &&
      fault[0] == L'1') { std::puts("CREATED"); std::fflush(stdout); Sleep(INFINITE); }
#endif
  unsigned char copiedDigest[32]{}, pendingDigest[32]{};
  unsigned long long copied = 0;
  Identity pendingId, sourceAfter;
  CopyFault stageFault = CopyFault::None;
#ifdef AITEST_FAULT_FIXTURE
  const bool haltPartial = fixtureFaultRequested(L"AITEST_NATIVE_STAGE_HALT_AFTER_PARTIAL_WRITE", argv[4]);
  const bool failPartial = fixtureFaultRequested(L"AITEST_NATIVE_STAGE_FAIL_AFTER_PARTIAL_WRITE", argv[4]);
  if (haltPartial && failPartial) return 2;
  stageFault = haltPartial ? CopyFault::HaltAfterFirstWrite :
    failPartial ? CopyFault::FailAfterFirstWrite : CopyFault::None;
#endif
  if (!copyHeld(source.back().value, pending.back().value, copiedDigest, copied, stageFault) ||
      !snapshot(pending.back().value, pendingId, pendingDigest) || pendingId.bytes != copied ||
      !identity(source.back().value, sourceAfter) || !sameIdentity(sourceBefore, sourceAfter) ||
      std::memcmp(copiedDigest, pendingDigest, 32) != 0) return 2;
  char serial[17]{};
  std::snprintf(serial, sizeof(serial), "%016llx", pendingId.id.VolumeSerialNumber);
  std::printf("COPIED\t%s\t%s\t%llu\t%s\n", serial,
    ascii(fileIdHex(pendingId)).c_str(), pendingId.bytes, ascii(digestHex(pendingDigest)).c_str());
  std::fflush(stdout);
  if (!std::getline(std::cin, line)) return 2;
  std::vector<std::string> fields;
  size_t fieldStart = 0;
  for (;;) {
    const size_t fieldEnd = line.find('\t', fieldStart);
    fields.push_back(line.substr(fieldStart, fieldEnd == std::string::npos ? fieldEnd : fieldEnd - fieldStart));
    if (fieldEnd == std::string::npos) break;
    fieldStart = fieldEnd + 1;
  }
  if (fields.size() != 5 || fields[0] != "LINK" || fields[1] != serial ||
      fields[2] != ascii(fileIdHex(pendingId)) ||
      fields[3] != std::to_string(pendingId.bytes) ||
      fields[4] != ascii(digestHex(pendingDigest))) return 2;
  const HANDLE parent = pending.size() == 1 ? targetRoot.back().value : pending[pending.size() - 2].value;
  if (!linkHeld(pending.back().value, parent, stageParts.back())) return 2;
#ifdef AITEST_FAULT_FIXTURE
  if (GetEnvironmentVariableW(L"AITEST_NATIVE_STAGE_HALT_AFTER_LINK", fault, 2) == 1 &&
      fault[0] == L'1') { std::puts("LINK_CREATED"); std::fflush(stdout); Sleep(INFINITE); }
#endif
  pending.back() = Handle{};
  Handle stage;
  Identity stageId;
  unsigned char stageDigest[32]{};
  if (!openChild(parent, stageParts.back(), false, false,
        GENERIC_READ | FILE_READ_ATTRIBUTES, stage, FILE_SHARE_READ) ||
      !snapshot(stage.value, stageId, stageDigest) ||
      stageId.id.VolumeSerialNumber != pendingId.id.VolumeSerialNumber ||
      std::memcmp(stageId.id.FileId.Identifier, pendingId.id.FileId.Identifier, 16) != 0 ||
      stageId.bytes != pendingId.bytes ||
      std::memcmp(stageDigest, pendingDigest, 32) != 0) return 2;
  std::puts("LINKED"); std::fflush(stdout);
  return 0;
}

int renameOwned(int argc, wchar_t** argv) {
  if (argc != 11) return 2;
  std::wstring ignored;
  std::vector<std::wstring> from, to;
  if (!splitPath(argv[3], false, ignored, from) || !splitPath(argv[4], false, ignored, to) ||
      from.size() != to.size() || _wcsicmp(from.back().c_str(), to.back().c_str()) == 0) return 2;
  for (size_t i = 0; i + 1 < from.size(); ++i) {
    if (_wcsicmp(from[i].c_str(), to[i].c_str()) != 0) return 2;
  }
  std::vector<Handle> root, source;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  Identity rootId;
  if (!identity(root.back().value, rootId) || !expectedRoot(rootId, argv[5], argv[6]) ||
      !openRelative(root.back().value, argv[3], false,
        GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, source, false,
        FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
  Identity before;
  unsigned char digest[32]{};
  if (!snapshot(source.back().value, before, digest)) return 2;
  char serial[17]{};
  std::snprintf(serial, sizeof(serial), "%016llx", before.id.VolumeSerialNumber);
  if (ascii(argv[7]) != serial || ascii(argv[8]) != ascii(fileIdHex(before)) ||
      ascii(argv[9]) != std::to_string(before.bytes) || ascii(argv[10]) != ascii(digestHex(digest))) return 2;
  std::puts("RENAME_READY");
  std::fflush(stdout);
  std::string line;
  if (!std::getline(std::cin, line) || line != "RENAME" ||
      !renameHeld(source.back().value, source.size() == 1 ? root.back().value : source[source.size() - 2].value,
        to.back())) return 2;
  Identity after;
  unsigned char afterDigest[32]{};
  if (!snapshot(source.back().value, after, afterDigest) || !sameIdentity(before, after) ||
      std::memcmp(digest, afterDigest, 32) != 0) return 2;
  printIdentity(after, afterDigest);
  return 0;
}

int verifyOwned(int argc, wchar_t** argv) {
  if (argc != 10) return 2;
  std::vector<Handle> root, file;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  Identity rootId;
  if (!identity(root.back().value, rootId) || !expectedRoot(rootId, argv[4], argv[5]) ||
      !openRelative(root.back().value, argv[3], false,
        GENERIC_READ | FILE_READ_ATTRIBUTES, file, false, FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
  Identity found;
  unsigned char digest[32]{};
  if (!snapshot(file.back().value, found, digest)) return 2;
  char serial[17]{};
  std::snprintf(serial, sizeof(serial), "%016llx", found.id.VolumeSerialNumber);
  if ((wcscmp(argv[6], L"-") != 0 && ascii(argv[6]) != serial) ||
      (wcscmp(argv[7], L"-") != 0 && ascii(argv[7]) != ascii(fileIdHex(found))) ||
      ascii(argv[8]) != std::to_string(found.bytes) || ascii(argv[9]) != ascii(digestHex(digest))) return 2;
  printIdentity(found, digest);
  return 0;
}

bool decodeUtf16Hex(const std::string& encoded, std::wstring& path) {
  if (encoded.empty() || encoded.size() % 4 != 0 || encoded.size() > 32768) return false;
  path.clear();
  for (size_t i = 0; i < encoded.size(); i += 4) {
    unsigned value = 0;
    for (size_t j = 0; j < 4; ++j) {
      const char c = encoded[i + j];
      const int nibble = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
      if (nibble < 0) return false;
      value = (value << 4) | static_cast<unsigned>(nibble);
    }
    path.push_back(static_cast<wchar_t>((value >> 8) | ((value & 0xff) << 8)));
  }
  return true;
}

bool decodeRelativeHex(const std::string& encoded, std::wstring& path) {
  if (!decodeUtf16Hex(encoded, path)) return false;
  std::wstring ignored;
  std::vector<std::wstring> parts;
  return splitPath(path, false, ignored, parts);
}

bool decodeBytesHex(const std::string& encoded, std::string& bytes) {
  if (encoded.empty() || encoded.size() % 2 != 0 || encoded.size() > 32 * 1024 * 1024) return false;
  bytes.clear(); bytes.reserve(encoded.size() / 2);
  for (size_t i = 0; i < encoded.size(); i += 2) {
    auto nibble = [](char c) -> int {
      return c >= '0' && c <= '9' ? c - '0' + 0 : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
    };
    const int hi = nibble(encoded[i]), lo = nibble(encoded[i + 1]);
    if (hi < 0 || lo < 0) return false;
    bytes.push_back(static_cast<char>((hi << 4) | lo));
  }
  return true;
}

std::vector<std::string> tabFields(const std::string& line) {
  std::vector<std::string> result;
  size_t start = 0;
  for (;;) {
    const size_t end = line.find('\t', start);
    result.push_back(line.substr(start, end == std::string::npos ? end : end - start));
    if (end == std::string::npos) return result;
    start = end + 1;
  }
}

int blobVerifySession(int argc, wchar_t** argv) {
  if (argc != 5) return 2;
  std::vector<Handle> root;
  if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) return 2;
  Identity rootId;
  if (!identity(root.back().value, rootId) || !expectedRoot(rootId, argv[3], argv[4])) return 2;
  struct HeldBlob { std::wstring path; Identity identity; unsigned char digest[32]{}; std::vector<Handle> chain; };
  std::vector<HeldBlob> held;
  bool sealed = false;
  bool committed = false;
  std::puts("READY");
  std::fflush(stdout);
  std::string line;
  while (std::getline(std::cin, line)) {
    const auto fields = tabFields(line);
    if (fields[0] == "ABORT" && fields.size() == 1) {
      std::puts("ABORTED"); std::fflush(stdout); return 0;
    }
    if (fields[0] == "VERIFY" && fields.size() == 6 && !sealed && held.size() < 4096) {
      HeldBlob blob;
      if (!decodeRelativeHex(fields[1], blob.path) ||
          !openRelative(root.back().value, blob.path, false,
            GENERIC_READ | FILE_READ_ATTRIBUTES, blob.chain, false, FILE_SHARE_READ) ||
          !snapshot(blob.chain.back().value, blob.identity, blob.digest)) return 2;
      char serial[17]{};
      std::snprintf(serial, sizeof(serial), "%016llx", blob.identity.id.VolumeSerialNumber);
      if (fields[2] != serial || fields[3] != ascii(fileIdHex(blob.identity)) ||
          fields[4] != std::to_string(blob.identity.bytes) || fields[5] != ascii(digestHex(blob.digest))) return 2;
      held.push_back(std::move(blob));
      std::printf("VERIFIED\t%zu\t%s\t%s\t%llu\t%s\n", held.size(), serial,
        ascii(fileIdHex(held.back().identity)).c_str(), held.back().identity.bytes,
        ascii(digestHex(held.back().digest)).c_str());
      std::fflush(stdout);
      continue;
    }
    if (fields[0] == "SEAL" && fields.size() == 2 && !sealed &&
        fields[1] == std::to_string(held.size())) {
      std::vector<Handle> observedRoot;
      Identity observedRootId;
      if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, observedRoot) ||
          !identity(observedRoot.back().value, observedRootId) || !sameIdentity(rootId, observedRootId)) return 2;
      for (auto& blob : held) {
        std::vector<Handle> observed;
        Identity found;
        unsigned char digest[32]{};
        if (!openRelative(root.back().value, blob.path, false,
              GENERIC_READ | FILE_READ_ATTRIBUTES, observed, false, FILE_SHARE_READ) ||
            !snapshot(observed.back().value, found, digest) ||
            !sameIdentity(found, blob.identity) || std::memcmp(digest, blob.digest, 32) != 0) return 2;
      }
      sealed = true;
      std::puts("SEALED"); std::fflush(stdout); continue;
    }
    if (fields[0] == "COMMIT" && fields.size() == 7 && sealed && !committed) {
      std::wstring journalPath;
      std::string terminalLine;
      if (!decodeUtf16Hex(fields[1], journalPath) ||
          !decodeBytesHex(fields[6], terminalLine) || terminalLine.empty() ||
          terminalLine.back() != '\n' ||
          terminalLine.find('\n') != terminalLine.size() - 1) return 2;
      std::vector<Handle> journal;
      Identity before;
      unsigned char digest[32]{};
      if (!openAbsolute(journalPath, false, GENERIC_READ | FILE_APPEND_DATA, journal, FILE_SHARE_READ) ||
          !snapshot(journal.back().value, before, digest)) return 2;
      char serial[17]{};
      std::snprintf(serial, sizeof(serial), "%016llx", before.id.VolumeSerialNumber);
      if (fields[2] != serial || fields[3] != ascii(fileIdHex(before)) ||
          fields[4] != std::to_string(before.bytes) || fields[5] != ascii(digestHex(digest))) return 2;
      std::vector<Handle> observedRoot;
      Identity observedRootId;
      if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, observedRoot) ||
          !identity(observedRoot.back().value, observedRootId) || !sameIdentity(rootId, observedRootId)) return 2;
      DWORD written = 0;
      if (!WriteFile(journal.back().value, terminalLine.data(), static_cast<DWORD>(terminalLine.size()),
            &written, nullptr) || written != terminalLine.size() ||
          !FlushFileBuffers(journal.back().value)) return 2;
      committed = true;
#ifdef AITEST_FAULT_FIXTURE
      // Deterministic Windows fixture: exit after durable commit and before stdout ACK.
      wchar_t dropAck[2]{};
      if (GetEnvironmentVariableW(L"AITEST_NATIVE_BLOB_COMMIT_DROP_ACK", dropAck, 2) == 1 &&
          dropAck[0] == L'1') return 2;
#endif
      std::puts("COMMITTED"); std::fflush(stdout); continue;
    }
    if (fields[0] == "CLOSE" && fields.size() == 1 && committed) {
      std::puts("CLOSED"); std::fflush(stdout); return 0;
    }
    return 2;
  }
  return 2;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc > 1 && wcscmp(argv[1], L"session") == 0) return restoreSession(argc, argv, false);
  if (argc > 1 && wcscmp(argv[1], L"recover-session") == 0) return restoreSession(argc, argv, true);
  if (argc > 1 && wcscmp(argv[1], L"session-fresh") == 0) return freshRestoreSession(argc, argv, false);
  if (argc > 1 && wcscmp(argv[1], L"recover-fresh") == 0) return freshRestoreSession(argc, argv, true);
  if (argc > 1 && wcscmp(argv[1], L"delete-owned-session") == 0) return deleteOwnedSession(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"delete-owned-probe") == 0) return deleteOwnedSession(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"copy-owned") == 0) return copyOwned(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"copy-stage-session") == 0) return copyStageSession(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"rename-owned") == 0) return renameOwned(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"verify-owned") == 0) return verifyOwned(argc, argv);
  if (argc > 1 && wcscmp(argv[1], L"blob-verify-session") == 0) return blobVerifySession(argc, argv);
  if (argc == 7 && wcscmp(argv[1], L"rename-probe") == 0) {
    if (!safeComponent(argv[3]) || !safeComponent(argv[4]) || wcscmp(argv[3], argv[4]) == 0) return 2;
    std::vector<Handle> root;
    if (!openAbsolute(argv[2], true, FILE_READ_ATTRIBUTES, root)) { std::fwprintf(stderr, L"root\n"); return 2; }
    Handle source;
    if (!openChild(root.back().value, argv[3], false, false,
      GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE, source, FILE_SHARE_READ)) { std::fwprintf(stderr, L"source %lu\n", GetLastError()); return 2; }
    Identity before, after;
    unsigned char digest[32]{};
    if (!identity(source.value, before) || before.links != 1 || !hashHeld(source.value, digest) ||
        fileIdHex(before) != argv[5] || digestHex(digest) != argv[6]) { std::fwprintf(stderr, L"evidence\n"); return 2; }
    if (!renameHeld(source.value, root.back().value, argv[4])) { std::fwprintf(stderr, L"rename %lu\n", GetLastError()); return 2; }
    if (!identity(source.value, after) || !sameIdentity(before, after)) { std::fwprintf(stderr, L"post\n"); return 2; }
    printIdentity(after, digest);
    return 0;
  }
  if (argc == 3 && wcscmp(argv[1], L"hold-transition") == 0) {
    std::vector<Handle> renameChain, readChain;
    if (!openAbsolute(argv[2], false, GENERIC_READ | FILE_READ_ATTRIBUTES | DELETE,
      renameChain, FILE_SHARE_READ) ||
        !openAbsolute(argv[2], false, GENERIC_READ | FILE_READ_ATTRIBUTES,
          readChain, FILE_SHARE_READ | FILE_SHARE_DELETE)) return 2;
    Identity before, after;
    if (!identity(renameChain.back().value, before) || !identity(readChain.back().value, after) ||
        !sameIdentity(before, after)) return 2;
    renameChain.clear();
    std::puts("READY");
    std::fflush(stdout);
    char ignored = 0;
    while (std::fread(&ignored, 1, 1, stdin) == 1) {}
    return 0;
  }
  if (argc == 3 && (wcscmp(argv[1], L"hold-read") == 0 || wcscmp(argv[1], L"hold-rename") == 0)) {
    std::vector<Handle> chain;
    const DWORD access = GENERIC_READ | FILE_READ_ATTRIBUTES |
      (wcscmp(argv[1], L"hold-rename") == 0 ? DELETE : 0);
    if (!openAbsolute(argv[2], false, access, chain, FILE_SHARE_READ)) return 2;
    std::puts("READY");
    std::fflush(stdout);
    char ignored = 0;
    while (std::fread(&ignored, 1, 1, stdin) == 1) {}
    return 0;
  }
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
