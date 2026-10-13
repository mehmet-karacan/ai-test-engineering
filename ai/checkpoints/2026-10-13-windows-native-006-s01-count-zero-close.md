# S01 recovery count-zero CLOSE

- `recover-session` can reopen with physical forward count zero after the last reverse MOVE but before terminal journal fsync. The previous helper rejected CLOSE solely because its new session sequence was zero, leaving an otherwise intact old layout blocked.
- A real packaged Windows fixture first failed waiting for CLOSED, then passed after permitting CLOSE for an accepted recovery session with old DB/sidecars at origin and staged DB still staged. No file mutation occurs in this zero-count case. This does not by itself make startup recovery automatic.
- MSVC `/W4 /WX` build passed. Packaged source SHA256 `62af613ac4f1a6efcfcb4f47c489e6e00797d3cef26de2bfd4196fb23906f03f`; EXE SHA256 `756d2353a210f272cf8a0cac31c8458480e4c49a06f3f2bcde2c391fbd768aef`; manifest verification passed. Focused fixture 1/1 passed. The earlier full native bridge test's teardown intermittently failed EPERM while deleting its freshly built EXE; this isolated fixture uses the verified packaged helper and passed.
- Reverse receipt journal, sync startup worker, terminal generation seal and full WN11/12/13 acceptance remain open.
