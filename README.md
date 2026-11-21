# Bütçe Pro (`butceapp`)

Android, iOS (Expo Go) ve Web için React Native (Expo Router + TypeScript) + Supabase tabanlı bireysel bütçe ve kişisel finans uygulaması.

## Özellikler
- **Çoklu Hesap & Kredi Kartı:** Nakit, Banka, Kredi Kartı (limit, kesim/son ödeme tarihi, taksit bölme), Yatırım ve hesaplar arası transfer
- **2A Gerçek Net Varlık:** Nakit + Banka + Yatırım + Kumbaralar − Kredi Kartı Toplam Borcu (gelecek taksitler dahil); Borç/Alacak defteri ayrı özetlenir
- **Taksitler & Düzenli Ödemeler:** 2–24 ay taksit planı, günlük/haftalık/aylık/yıllık düzenli gelir ve fatura/abonelik kuralları
- **Bütçe Limitleri & Uyarılar:** Genel ve kategori bazlı aylık limitler (%80 / %100 uyarıları), önceki aydan kopyalama ve ay sonu harcama tahmini
- **Raporlar & Grafikler:** Günlük, haftalık, aylık, yıllık ve özel tarih aralığı KPI'ları, dönem kıyaslaması, 4 interaktif SVG grafik ve günlük harcama takvimi
- **Rapor Paylaşımı & Dışa Aktarma:** Gizlilik filtreli, süreli ve iptal edilebilir salt-okunur `/shared/[token]` web linki + PDF, CSV (Excel UTF-8 BOM) ve JSON yedek/geri yükleme
- **Çoklu Para Birimi & Güvenlik:** Canlı döviz/altın kuru (`TRY`, `USD`, `EUR`, `GBP`, `XAU`), PIN + biyometrik kilit, gizlilik modu, koyu/açık tema
- **Bulut & Offline-First:** E-posta+Şifre & Google ile Giriş, Supabase PostgreSQL + RLS + Storage senkronizasyonu (`.env` girilmeden Yerel/Demo modunda anında çalışır)

## Hızlı Başlangıç

```bash
npm install
npx expo start --web   # Tarayıcıda çalıştır
npx expo start         # Android / iOS (Expo Go QR)
```

Test ve tip kontrolü:

```bash
npm test
npm run typecheck
```

Bulut (Supabase + Google ile Giriş + canlı rapor paylaşımı) kurulumu için [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) dosyasına bakın.
