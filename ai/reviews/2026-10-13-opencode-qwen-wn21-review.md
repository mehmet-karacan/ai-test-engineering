# OpenCode Qwen3.8 WN21 bagimsiz inceleme

- Tarih 2026-10-13. Model: `litellm/Qwen3.8-27B-IT`, OpenCode v2.0.27 `plan` ajaninda salt okunur CLI oturumu. Kapsam: `99b10a9`, `922ec59`, `78acc15` ve iliskili kod/test. Repo dosyasi degistirilmedi; Maven/customer calistirilmadi.
- P2 dogrulandi: `MavenRunner` timeout/cancel/spawn-error sonrasi yazili log ve truncation sayaclarini `AppError.details` ile firlatiyor; dispatcher catch kalici run/artifact kaniti yazmiyor. S02 agent bu yolu ayrik fixture ile duzeltiyor.
- P2 dogrulandi: artifact blob DB transaction oncesi yayinlaniyor. Hard-kill araliginda DB'de artifact satiri yokken fiziksel blob kalabiliyor; mevcut retention GC yalniz DB satirlarini taradigi icin bu orphan'i toplamiyor. Guvenilir kanit olusmuyor, fakat disk birikimi acik.
- Qwen `78acc15` FAILED/UNSTABLE gercek baseline kaydinin erken return oncesi yazildigini, `NO_TESTS` run=null icin sahte kayit uretilemedigini dogruladi. Yeni P1 bildirmedi.
- Qwen, yalniz normal repository yazicisi altinda duplicate pin'i sorun saymadi. Bu sonuc raw writer/import/restore ile iki farkli READY artifact satirinin ayni `(job_id, kind, pin_reason)` altina girebildigi SQLite fixture'ini kapsamiyor. Bagimsiz Codex review P2'si ve `c7f62d8` fail-closed duzeltmesi bu nedenle korunur.
- Inceleme, mevcut red/green fixture'larin ve full WN21 kabulunun yerine gecmez. S02 VERIFIED/customer gate NO_GO.
