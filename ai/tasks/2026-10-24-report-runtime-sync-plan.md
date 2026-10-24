# Rapor durum esleme plani

Goal: yeni raporlar terminal DB durumunu gostersin; eski, butunlugu dogrulanmis raporlar status/result okumasinda ayni duruma gelsin. Kullanici sonucu dogrulama ve kalan degisiklikleri commit/push yapma yetkisi verdi.

- [x] Gercek SQLite/job ve ReportExporter ile eski RUNNING/READY_FOR_REVIEW raporunu yeniden uret. HTML/JSON/status/result eslesmesini RED ile goster.
- [x] Report runtime projeksiyonu ve dogrulanmis eski rapor yenilemesini ekle; evidence baytlari/kimlikleri/counterlari korunur, bozuk veya yayinsiz rapor onarilmaz.
- [x] Yeni rapor finalizasyonunu DB transaction ve verified export ile bagla. Export/commit hatasinda terminal state rollback ve PUBLISHED iptali; pause/cancel/lease korumasi.
- [x] Odak, tam Windows, Chrome PDF, Java support kalan testi, bagimsiz review; mevcut dosyalari kontrol ederek kalan is kayitlarini commit/push et. Main MCP build ve remote HEAD dogrula.

Constraints: AITE-MCP-GPU-009/M01..M06, CI kapali; yeni customer/model kosusu veya GPU Git islemi yok. Session dosyasi okunmaz; runtime rapor/log/blob public repoya alinmaz. Calisma d03b izole worktree'de.

Ruling: kullanici tam uygulama ve commit/push istedi; rutin plan/yerel entegrasyon icin yeniden onay alinmaz. Eski raporlar sadece manifest/PUBLISHED dogrulamasi sonrasi yeniden projekte edilir.
