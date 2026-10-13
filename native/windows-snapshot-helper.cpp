// S03 execution snapshot: one held-root transaction for copies and manifest.
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

bool component(const std::wstring& value) {
  if (value.empty() || value == L"." || value == L".." || value.size() > 255 ||
      value.back() == L'.' || value.back() == L' ') return false;
  for (wchar_t c : value) if (c < 32 || wcschr(L"\\/:*?\"<>|", c)) return false;
  std::wstring stem;
  for (wchar_t c : value) { if (c == L'.') break; stem.push_back(static_cast<wchar_t>(towupper(c))); }
  if (stem == L"CON" || stem == L"PRN" || stem == L"AUX" || stem == L"NUL") return false;
  if (stem.size() == 4 && (stem.substr(0, 3) == L"COM" || stem.substr(0, 3) == L"LPT") &&
      stem[3] >= L'1' && stem[3] <= L'9') return false;
  return true;
}

bool split(const std::wstring& value, bool absolute, std::wstring& drive, std::vector<std::wstring>& parts) {
  size_t start = 0;
  if (absolute) {
    if (value.size() < 3 || !iswalpha(value[0]) || value[1] != L':' ||
        (value[2] != L'\\' && value[2] != L'/')) return false;
    drive = value.substr(0, 3); drive[2] = L'\\'; start = 3;
  } else if (value.empty() || value[0] == L'\\' || value[0] == L'/') return false;
  while (start < value.size()) {
    const size_t end = value.find_first_of(L"\\/", start);
    const std::wstring part = value.substr(start, end == std::wstring::npos ? end : end - start);
    if (!component(part)) return false;
    parts.push_back(part);
    if (end == std::wstring::npos) break;
    start = end + 1;
    if (start == value.size()) return false;
  }
  return absolute || !parts.empty();
}

bool valid(HANDLE h, bool directory) {
  FILE_ATTRIBUTE_TAG_INFO info{};
  if (!GetFileInformationByHandleEx(h, FileAttributeTagInfo, &info, sizeof(info)) ||
      (info.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) return false;
  return directory ? (info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 :
    (info.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

bool child(HANDLE parent, const std::wstring& name, bool directory, bool create, DWORD access, Handle& out,
    ULONG share = FILE_SHARE_READ | FILE_SHARE_WRITE) {
  if (!component(name)) return false;
  UNICODE_STRING text{};
  text.Buffer = const_cast<PWSTR>(name.c_str());
  text.Length = static_cast<USHORT>(name.size() * sizeof(wchar_t));
  text.MaximumLength = text.Length;
  OBJECT_ATTRIBUTES attrs{};
  InitializeObjectAttributes(&attrs, &text, OBJ_CASE_INSENSITIVE | OBJ_DONT_REPARSE, parent, nullptr);
  IO_STATUS_BLOCK io{};
  HANDLE opened = INVALID_HANDLE_VALUE;
  const ULONG opts = FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT | FILE_OPEN_FOR_BACKUP_INTENT |
    (directory ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE);
  const NTSTATUS status = NtCreateFile(&opened, access | SYNCHRONIZE, &attrs, &io, nullptr,
    FILE_ATTRIBUTE_NORMAL, share, create ? FILE_CREATE : FILE_OPEN, opts, nullptr, 0);
  if (status < 0 || opened == INVALID_HANDLE_VALUE) return false;
  out = Handle(opened);
  return valid(out.value, directory);
}

bool absoluteRoot(const std::wstring& path, std::vector<Handle>& chain) {
  std::wstring drive;
  std::vector<std::wstring> parts;
  if (!split(path, true, drive, parts)) return false;
  Handle root(CreateFileW(drive.c_str(), FILE_READ_ATTRIBUTES | SYNCHRONIZE, FILE_SHARE_READ | FILE_SHARE_WRITE,
    nullptr, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (root.value == INVALID_HANDLE_VALUE || !valid(root.value, true)) return false;
  chain.push_back(std::move(root));
  for (const auto& part : parts) {
    Handle next;
    if (!child(chain.back().value, part, true, false, FILE_READ_ATTRIBUTES, next)) return false;
    chain.push_back(std::move(next));
  }
  return true;
}

bool sameRootChain(const std::wstring& path, const std::vector<Handle>& held) {
  std::vector<Handle> current;
  if (!absoluteRoot(path, current) || current.size() != held.size()) return false;
  for (size_t i = 0; i < held.size(); ++i) {
    FILE_ID_INFO before{}, after{};
    if (!GetFileInformationByHandleEx(held[i].value, FileIdInfo, &before, sizeof(before)) ||
        !GetFileInformationByHandleEx(current[i].value, FileIdInfo, &after, sizeof(after)) ||
        std::memcmp(&before, &after, sizeof(before)) != 0) return false;
  }
  return true;
}

std::string hexId(HANDLE h) {
  FILE_ID_INFO info{};
  if (!GetFileInformationByHandleEx(h, FileIdInfo, &info, sizeof(info))) return {};
  char chars[49]{};
  std::snprintf(chars, sizeof(chars), "%016llx", info.VolumeSerialNumber);
  for (size_t i = 0; i < 16; ++i) std::snprintf(chars + 16 + i * 2, 3, "%02x", info.FileId.Identifier[i]);
  return chars;
}

bool hexBytes(const std::string& input, std::string& output) {
  if (input.size() % 2 != 0) return false;
  output.clear(); output.reserve(input.size() / 2);
  for (size_t i = 0; i < input.size(); i += 2) {
    const auto nibble = [](char c) -> int {
      if (c >= '0' && c <= '9') return c - '0';
      if (c >= 'a' && c <= 'f') return c - 'a' + 10;
      return -1;
    };
    const int a = nibble(input[i]), b = nibble(input[i + 1]);
    if (a < 0 || b < 0) return false;
    output.push_back(static_cast<char>((a << 4) | b));
  }
  return true;
}

bool hexName(const std::string& hex, std::wstring& result) {
  std::string bytes;
  if (!hexBytes(hex, bytes) || bytes.empty() || bytes.size() % 2 != 0) return false;
  result.clear();
  for (size_t i = 0; i < bytes.size(); i += 2)
    result.push_back(static_cast<wchar_t>(static_cast<unsigned char>(bytes[i]) |
      (static_cast<unsigned char>(bytes[i + 1]) << 8)));
  return true;
}

bool sha256(HANDLE source, HANDLE target, std::string& result, unsigned long long& bytes) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
  bool ok = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) >= 0;
  std::unique_ptr<unsigned char[]> buffer(new unsigned char[1024 * 1024]);
  bytes = 0;
  while (ok) {
    DWORD count = 0;
    if (!ReadFile(source, buffer.get(), 1024 * 1024, &count, nullptr)) { ok = false; break; }
    if (count == 0) break;
    if (BCryptHashData(hash, buffer.get(), count, 0) < 0) { ok = false; break; }
    if (target) {
      DWORD written = 0;
      if (!WriteFile(target, buffer.get(), count, &written, nullptr) || written != count) { ok = false; break; }
    }
    bytes += count;
  }
  unsigned char digest[32]{};
  if (ok) ok = BCryptFinishHash(hash, digest, 32, 0) >= 0;
  if (hash) BCryptDestroyHash(hash);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (!ok) return false;
  static constexpr char digits[] = "0123456789abcdef";
  result.clear();
  for (unsigned char value : digest) { result.push_back(digits[value >> 4]); result.push_back(digits[value & 15]); }
  return true;
}

bool markDelete(HANDLE h) {
  FILE_DISPOSITION_INFO disposition{TRUE};
  return SetFileInformationByHandle(h, FileDispositionInfo, &disposition, sizeof(disposition)) != 0;
}

std::wstring temporaryManifestName() {
  unsigned char random[16]{};
  if (BCryptGenRandom(nullptr, random, sizeof(random), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0) return {};
  static constexpr wchar_t digits[] = L"0123456789abcdef";
  std::wstring name = L"snapshot-manifest.json.tmp-";
  for (unsigned char byte : random) { name.push_back(digits[byte >> 4]); name.push_back(digits[byte & 15]); }
  return name;
}

bool renameHeld(HANDLE source, HANDLE targetDirectory, const std::wstring& targetName) {
  if (!component(targetName)) return false;
  const size_t nameBytes = targetName.size() * sizeof(wchar_t);
  std::vector<unsigned char> buffer(offsetof(FILE_RENAME_INFO, FileName) + nameBytes);
  auto* info = reinterpret_cast<FILE_RENAME_INFO*>(buffer.data());
  info->ReplaceIfExists = FALSE;
  info->RootDirectory = targetDirectory;
  info->FileNameLength = static_cast<DWORD>(nameBytes);
  std::memcpy(info->FileName, targetName.data(), nameBytes);
  IO_STATUS_BLOCK io{};
  return NtSetInformationFile(source, &io, info, static_cast<ULONG>(buffer.size()),
    static_cast<FILE_INFORMATION_CLASS>(10)) >= 0;
}

struct Created {
  Handle file;
  Created() = default;
  explicit Created(Handle&& value) : file(std::move(value)) {}
  Created(Created&&) = default;
  Created& operator=(Created&&) = default;
};

struct CreatedDirectory {
  std::wstring path;
  Handle file;
  CreatedDirectory(std::wstring name, Handle&& value) : path(std::move(name)), file(std::move(value)) {}
  CreatedDirectory(CreatedDirectory&&) = default;
  CreatedDirectory& operator=(CreatedDirectory&&) = default;
};

bool copyOne(HANDLE sourceRoot, HANDLE targetRoot, const std::wstring& relative,
    unsigned long long expectedBytes, const std::string& expectedHash,
    std::vector<Created>& files, std::vector<CreatedDirectory>& directories) {
  std::wstring ignored;
  std::vector<std::wstring> parts;
  if (!split(relative, false, ignored, parts)) return false;
  std::vector<Handle> source, target;
  HANDLE src = sourceRoot, dst = targetRoot;
  std::wstring directoryPath;
  for (size_t i = 0; i + 1 < parts.size(); ++i) {
    Handle srcDir, dstDir;
    if (!child(src, parts[i], true, false, FILE_READ_ATTRIBUTES, srcDir)) return false;
    if (!directoryPath.empty()) directoryPath += L"\\";
    directoryPath += parts[i];
    for (const auto& created : directories) if (created.path == directoryPath) {
      HANDLE duplicate = INVALID_HANDLE_VALUE;
      if (!DuplicateHandle(GetCurrentProcess(), created.file.value, GetCurrentProcess(), &duplicate, 0, FALSE,
          DUPLICATE_SAME_ACCESS)) return false;
      dstDir = Handle(duplicate);
      break;
    }
    if (dstDir.value == INVALID_HANDLE_VALUE && !child(dst, parts[i], true, false, FILE_READ_ATTRIBUTES, dstDir)) {
      if (!child(dst, parts[i], true, true, FILE_READ_ATTRIBUTES | DELETE, dstDir)) return false;
      HANDLE duplicate = INVALID_HANDLE_VALUE;
      if (!DuplicateHandle(GetCurrentProcess(), dstDir.value, GetCurrentProcess(), &duplicate, 0, FALSE,
          DUPLICATE_SAME_ACCESS)) { markDelete(dstDir.value); return false; }
      directories.emplace_back(directoryPath, Handle(duplicate));
    }
    src = srcDir.value; dst = dstDir.value;
    source.push_back(std::move(srcDir)); target.push_back(std::move(dstDir));
  }
  Handle input, output;
  if (!child(src, parts.back(), false, false, GENERIC_READ | FILE_READ_ATTRIBUTES, input, FILE_SHARE_READ) ||
      !child(dst, parts.back(), false, true, GENERIC_READ | GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE,
        output, 0)) return false;
  files.emplace_back(std::move(output));
  BY_HANDLE_FILE_INFORMATION before{}, after{};
  if (!GetFileInformationByHandle(input.value, &before) || before.nNumberOfLinks != 1) return false;
  std::string digest;
  unsigned long long count = 0;
  if (!sha256(input.value, files.back().file.value, digest, count) ||
      !FlushFileBuffers(files.back().file.value) || count != expectedBytes || digest != expectedHash ||
      !GetFileInformationByHandle(input.value, &after) || before.nFileIndexHigh != after.nFileIndexHigh ||
      before.nFileIndexLow != after.nFileIndexLow || before.nFileSizeHigh != after.nFileSizeHigh ||
      before.nFileSizeLow != after.nFileSizeLow ||
      CompareFileTime(&before.ftLastWriteTime, &after.ftLastWriteTime) != 0) return false;
  return true;
}

int run(int argc, wchar_t** argv) {
  if (argc != 6 || wcscmp(argv[1], L"snapshot") != 0) return 2;
  std::vector<Handle> sourceRoot, targetRoot;
  if (!absoluteRoot(argv[2], sourceRoot) || !absoluteRoot(argv[3], targetRoot)) return 2;
  const std::string sourceId = hexId(sourceRoot.back().value), targetId = hexId(targetRoot.back().value);
  const auto ascii = [](const wchar_t* input) -> std::string {
    std::string out;
    for (const wchar_t* p = input; *p; ++p) { if (*p > 127) return {}; out.push_back(static_cast<char>(*p)); }
    return out;
  };
  if (sourceId.empty() || targetId.empty() || sourceId == targetId || sourceId != ascii(argv[4]) ||
      targetId != ascii(argv[5]) || sourceId.substr(0, 16) != targetId.substr(0, 16)) return 3;
  std::puts("READY");
  std::fflush(stdout);
  std::vector<Created> files;
  std::vector<CreatedDirectory> directories;
  bool completed = false;
  bool manifestSeen = false;
  size_t manifestIndex = 0;
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line == "END") { completed = manifestSeen; break; }
    if (line == "BARRIER") { std::puts("BARRIER"); std::fflush(stdout); continue; }
    const size_t first = line.find('\t');
    if (first == std::string::npos) break;
    const std::string kind = line.substr(0, first);
    if (kind == "FILE") {
      if (manifestSeen) break;
      const size_t second = line.find('\t', first + 1), third = line.find('\t', second + 1);
      if (second == std::string::npos || third == std::string::npos) break;
      std::wstring name;
      const std::string count = line.substr(second + 1, third - second - 1);
      const std::string digest = line.substr(third + 1);
      if (!hexName(line.substr(first + 1, second - first - 1), name) || count.empty() ||
          count.find_first_not_of("0123456789") != std::string::npos || digest.size() != 64 ||
          digest.find_first_not_of("0123456789abcdef") != std::string::npos) break;
      unsigned long long bytes = 0;
      try { bytes = std::stoull(count); } catch (...) { break; }
      if (!copyOne(sourceRoot.back().value, targetRoot.back().value, name, bytes, digest, files, directories)) break;
    } else if (kind == "MANIFEST") {
      if (manifestSeen) break;
      std::string body;
      if (!hexBytes(line.substr(first + 1), body) || body.empty()) break;
      const std::wstring stagedName = temporaryManifestName();
      if (stagedName.empty()) break;
      Handle output;
      if (!child(targetRoot.back().value, stagedName, false, true,
          GENERIC_WRITE | FILE_READ_ATTRIBUTES | DELETE, output, 0)) break;
      manifestIndex = files.size();
      files.emplace_back(std::move(output));
      DWORD written = 0;
      if (body.size() > MAXDWORD || !WriteFile(files.back().file.value, body.data(), static_cast<DWORD>(body.size()),
          &written, nullptr) || written != body.size() || !FlushFileBuffers(files.back().file.value)) break;
      manifestSeen = true;
    } else break;
  }
  if (completed && (!sameRootChain(argv[2], sourceRoot) || !sameRootChain(argv[3], targetRoot))) completed = false;
  if (completed && !renameHeld(files[manifestIndex].file.value, targetRoot.back().value, L"snapshot-manifest.json")) completed = false;
  if (completed && (!sameRootChain(argv[2], sourceRoot) || !sameRootChain(argv[3], targetRoot))) completed = false;
  if (!completed) {
    bool cleaned = true;
    for (auto& file : files) cleaned = markDelete(file.file.value) && cleaned;
    files.clear();
    for (auto it = directories.rbegin(); it != directories.rend(); ++it) {
      cleaned = markDelete(it->file.value) && cleaned;
      it->file = Handle{};
    }
    directories.clear();
    return cleaned ? 2 : 4;
  }
  std::puts("OK");
  return 0;
}
}  // namespace

int wmain(int argc, wchar_t** argv) { return run(argc, argv); }
