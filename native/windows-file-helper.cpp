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
  ULONG share = FILE_SHARE_READ | FILE_SHARE_WRITE, NTSTATUS* statusOut = nullptr) {
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
  std::string line;
  while (std::getline(std::cin, line)) {
    const auto fields = splitTabs(line);
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
    if (fields.size() == 1 && fields[0] == "CLOSE") {
      const bool sidecarsAtOrigin = (!slots[1].present || slots[1].currentName == dbName + L"-wal") &&
        (!slots[2].present || slots[2].currentName == dbName + L"-shm");
      const bool sidecarsPreserved = (!slots[1].present || slots[1].currentName == dbName + L"-wal" + preservedSuffix) &&
        (!slots[2].present || slots[2].currentName == dbName + L"-shm" + preservedSuffix);
      const bool rolledBack = sequence > 0 && slots[0].currentName == dbName &&
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
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc > 1 && wcscmp(argv[1], L"session") == 0) return restoreSession(argc, argv, false);
  if (argc > 1 && wcscmp(argv[1], L"recover-session") == 0) return restoreSession(argc, argv, true);
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
