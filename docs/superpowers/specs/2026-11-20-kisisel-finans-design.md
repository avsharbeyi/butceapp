# Kişisel Finans ve Bütçe Yönetimi Mobil Uygulaması — Tasarım Dokümanı

**Tarih:** 2026-11-20  
**Proje Klasörü:** `C:\Users\Atmaca\.gemini\antigravity\scratch\butce-app`  
**Durum:** Onay Bekliyor

---

## 1. Amaç ve Neden Bu Uygulama?

Kullanıcının bireysel bütçe yönetimini tek bir yerde, yüksek fonksiyonellikle ve net görselleştirmelerle yönetebileceği bir kişisel finans uygulaması geliştirmek. Uygulama yalnızca basit gelir/gider kaydı tutmakla kalmayıp; çoklu hesapları, kredi kartı taksitlerini, düzenli fatura/abonelikleri, kategori bütçe limitlerini, birikim hedeflerini ve borç-alacak takibini tek çatı altında birleştirerek **günlük, haftalık, aylık ve yıllık** karar almayı kolaylaştıran zengin raporlar, grafikler ve başkalarıyla paylaşılabilir rapor bağlantıları sunmayı hedefler.

---

## 2. Hedefler, Kapsam Dışı (Non-Goals) ve Anti-Goals

### Hedefler (Goals)
- **Hızlı günlük kayıt:** Bir harcama veya geliri birkaç saniyede (hızlı numpad + son kullanılan hesap + kategori seçimiyle) kaydedebilmek.
- **Gerçekçi kişisel finans modeli:** Nakit, banka hesabı, kredi kartı (limit, kesim/son ödeme tarihi, taksit bölme), hesaplar arası transfer, düzenli işlemler, kategori bütçeleri, birikim hedefleri, borç-alacak ve çoklu para birimi (`TRY`, `USD`, `EUR`, `GBP`, `XAU`/Gram Altın) desteği.
- **Güçlü raporlama ve grafikler:** Günlük, haftalık, aylık, yıllık ve özel tarih aralığı bazında interaktif grafikler (gelir-gider karşılaştırma çubuğu, nakit akışı trend çizgisi, kategori donut grafiği, bütçe doluluk barları, önceki dönem kıyaslaması ve günlük harcama takvimi).
- **Rapor paylaşımı:** Finansal raporları başkalarına hem **salt-okunur canlı web linki** (gizlilik filtreli, süreli, iptal edilebilir) hem de **PDF / CSV** dosya paylaşımıyla açabilmek.
- **Çoklu cihaz & bulut senkronizasyonu:** Android, iPhone (iOS) ve Web tarayıcısı üzerinden E-posta+Şifre veya Google ile Giriş yaparak aynı veriye erişim; internet yokken de çalışıp bağlantı gelince eşitleme.
- **Güvenlik & yedekleme:** JSON yedek/geri yükleme, uygulama içi PIN/biyometrik kilit ve gizlilik (bakiye gizleme) modu.

### Kapsam Dışı (Non-Goals — İlk Sürümde Yok)
- Açık bankacılık (Open Banking) / banka API'lerinden veya SMS'lerden otomatik hesap çekimi.
- Borsa/kripto canlı portföy ve kar/zarar takibi (sadece temel döviz ve gram altın varlık/kur dönüşümü kapsamdadır).
- Çok kullanıcılı ortak düzenleme (başkalarına raporlar **salt-okunur** açılır; başkaları kullanıcının bütçesini düzenleyemez).
- OCR ile fiş metni otomatik ayrıştırma (fiş fotoğrafı ekleme ve saklama var, otomatik tutar okuma kapsam dışı).
- Uygulama içi abonelik/ödeme duvarı (paywall) veya reklam entegrasyonu.

### Anti-Goals (Teknik Olarak Çalışsa Bile Başarısızlık Sayılacak Durumlar)
- **Çift sayım hatası:** Hesaplar arası transferlerin, kredi kartı borç ödemelerinin veya kumbara aktarımlarının gelir/gider toplamını şişirmesi; taksitli harcamanın hem toplam tutar hem taksitler olarak iki kez gider yazılması.
- **Paylaşımda veri sızıntısı:** Rapor paylaşım linkinin, kullanıcının paylaşmadığı ham hesaplarına, diğer dönemlerine veya özel işlem notlarına erişim açması.
- **Yavaş kayıt akışı:** Tek bir harcamayı girmek için çok sayıda ekran gezmek veya bulut yanıtını bekleyerek arayüzün donması.
- **Anahtarsız kilitlenme:** Kullanıcı henüz Supabase/Google OAuth anahtarlarını girmeden uygulamanın açılmaması veya çökmesi (yerel/demo modda tüm özellikler anında çalışabilir olmalıdır).
- **Web veya Expo Go kırılması:** Sadece native build'de çalışan kütüphaneler yüzünden Windows üzerinde Expo Go veya Web testinin bozulması.

---

## 3. Kısıtlar (Constraints)

- **Geliştirme Ortamı:** Windows işletim sistemi; `Node.js (v26)` ve `Git` kurulu; Flutter, Java ve Android SDK kurulu değil; macOS yok. PowerShell script kısıtlaması nedeniyle CLI komutları `npm.cmd` / `npx.cmd` üzerinden çalıştırılır.
- **Hedef Platformlar:** Android, iPhone (iOS) ve Web (tek kod tabanı).
- **Maliyet:** Özel domain veya ücretli sunucu zorunlu olmamalı; Supabase ücretsiz katmanı, API anahtarsız ücretsiz kur kaynağı ve canlı paylaşım linkleri için opsiyonel ücretsiz statik web yayını (örn. Vercel/Netlify ücretsiz alt alan adı) ile sıfır altyapı maliyetiyle çalışmalı.
- **Dil & Para Birimi:** Uygulama arayüzü tamamen **Türkçe**, varsayılan ana para birimi **TRY (₺)**, tarih ve sayı biçimi `tr-TR` (`1.250,50 ₺`).

---

## 4. Değerlendirilen Teknik Yaklaşımlar ve Seçim

| Yaklaşım | Özet | Trade-off | Durum |
|---|---|---|---|
| **A — React Native (Expo) + Supabase** | Tek TypeScript kod tabanıyla Android + iOS + Web. Windows'tan Expo Go ile QR okutup iPhone/Android'de anında canlı test. Arka planda Supabase (PostgreSQL + Auth + Storage + RLS). | APK/IPA için ücretsiz Expo (EAS) hesabı, Google ile Giriş için ücretsiz Google Cloud OAuth ayarı gerekir. SQL veritabanı finansal raporlama/taksit/paylaşım güvenliği için çok sağlamdır ve gerçek native deneyim sunar. | **SEÇİLDİ (Kullanıcı Tercihi)** |
| **B — React Native (Expo) + Firebase** | Expo mobil/web + Google Firebase (Firestore, Auth, Storage). | Offline SDK güçlüdür, fakat Firestore NoSQL yapısı günlük/haftalık/aylık karmaşık toplam, çoklu kur ve taksit sorgularında veri modelini zorlaştırır. | Elendi |
| **C — Mobil Odaklı PWA (Next.js/React + Supabase)** | Tarayıcıdan "Ana Ekrana Ekle" ile çalışan web uygulaması. | Mağaza/Expo derdi sıfır, ancak gerçek native değil (FaceID/parmak izi kilidi, iOS yerel bildirimleri ve mobil his zayıf). | Elendi |
| *(Flutter)* | Dart/Flutter mobil çerçevesi. | Bu Windows makinede SDK/Android Studio kurulu değil ve Mac olmadan iOS canlı testi pratik değil. | Ön elemede elendi |

---

## 5. Ürün ve Fonksiyonel Tasarım

### 5.1. Karar Sahipliği
- **Kullanıcının Seçimleri:**
  - Bireysel bütçe yönetimi odağı + Tam Kapsamlı Kişisel Finans kapsamı.
  - Bulut senkronizasyonu + **E-posta/Şifre ve Google ile Giriş (1B)**.
  - **Gerçek Net Değer (2A):** `Toplam Net Varlık = Nakit + Banka + Yatırım + Birikim Hedefleri − Kredi Kartı Toplam Borcu (gelecek taksitler dahil)`; kişi borç/alacakları ayrı özet satırında gösterilir.
  - **Finansal raporları başkalarına açabilme** (canlı salt-okunur paylaşım linki + PDF/CSV paylaşımı).
  - Android + iPhone + Web desteği; Yaklaşım A (Expo + Supabase).
- **Tasarımcının Kararları (`[Tasarımcı Kararı]` — İnceleyip Değiştirebilirsin):**
  - Kredi kartı borç ödemesi yalnızca `transfer` sayılır (çift sayım önlenir); ekstre borcu kesim günü penceresiyle hesaplanır.
  - Kumbaraya hesaptan para aktarımı `transfer` sayılır (aylık gideri şişirmez, Tasarruf Oranını bozmaz).
  - Kişi borç/alacak ödemesi hesaba yansıtıldığında nakit akışı olarak `expense`/`income` kaydedilir; bağlı işlem değişirse hedef/borç bakiyesi otomatik güncellenir.
  - Hesap bakiyeleri ve Net Varlık güncel kurla (**mark-to-market**), dönemlik Gelir/Gider raporları ise işlem anındaki kurla hesaplanır.
  - Bütçe limitleri her ay için bağımsız satırlar olarak saklanır ("Önceki Aydan Kopyala" ile); böylece geçmiş ay raporları bozulmaz.
  - Özel ay başlangıç günü (`month_start_day`) yalnızca Aylık Rapor, Özet KPI ve Bütçeleri kaydırır; Takvim (1–31) ve Yıllık Rapor (Ocak–Aralık) standart kalır.
  - Demo verileri asla buluta yüklenmez; yerel gerçek veri ile bulut girişinde kullanıcıya birleştir/değiştir sorulur; çıkışta yerel veri gizlilik için temizlenir.
  - Fiş fotoğrafı ekleme, günlük harcama takvimi, PIN/biyometrik kilit, gizlilik modu, yerel bildirimler, koyu/açık tema, canlı döviz/altın kuru ve yapısal JSON yedek/geri yükleme varsayılan olarak dahildir.

---

### 5.2. Veri Modeli (Temel Varlıklar ve Muhasebe Kuralları)

Tüm para tutarları kayan nokta hatasını önlemek için `NUMERIC(14, 2)` ve kuruş hassasiyetli (tam sayı kuruş / güvenli yuvarlama) yardımcı fonksiyonlarla işlenir. Kullanıcıya ait her tablo `id (UUID)`, `user_id`, `created_at`, `updated_at`, `deleted_at` (soft-delete) ve yerel önbellek tarafında `is_demo` işaretini destekler.

1. **`accounts` (Hesaplar / Cüzdanlar)**
   - Alanlar: `name`, `type` (`cash` | `bank` | `credit_card` | `investment`), `currency` (`TRY` | `USD` | `EUR` | `GBP` | `XAU`), `initial_balance`, `credit_limit` *(kredi kartı)*, `statement_day` *(1–28, kredi kartı)*, `due_day` *(1–28, kredi kartı)*, `color`, `icon`, `is_archived`.
   - **Normal Hesap Bakiyesi:** `initial_balance + gelen(income + incoming transfer) − giden(expense + outgoing transfer)` (`deleted_at IS NULL` ve `date <= bugün`).
   - **Kredi Kartı Muhasebesi (`[Tasarımcı Kararı]` + `2A`):**
     - Kredi kartı harcamaları borcu artırır; kredi kartı ödemesi kesinlikle **`transfer` (Banka/Nakit → Kredi Kartı)** olarak işlenir ve asla Gider sayılmaz.
     - **Toplam Kart Borcu (`total_debt` / `used_limit`):** `initial_balance` (varsa başlangıç borcu) + **gelecek taksitler dahil** tüm ödenmemiş kart harcamaları − kart ödemeleri. Kullanıcı seçimi (`2A`) gereği **Toplam Net Varlık** hesabından bu toplam borç düşülür.
     - **Güncel Ekstre / Yaklaşan Ödeme:** `(önceki_kesim_günü, kesim_günü]` aralığındaki kart harcamaları (ve ilk ekstrede `initial_balance`) eksi kesim sonrası yapılan kart ödemeleri.
     - **Aylık Gider Raporları:** Her ay yalnızca o ayın tarihine düşen taksit tutarını gider olarak gösterir (çift sayım yok).

2. **`categories` (Kategoriler)**
   - Alanlar: `name`, `type` (`income` | `expense`), `icon`, `color`, `is_default`, `sort_order`.
   - Hazır Türkçe set (ilk açılışta otomatik oluşturulur; bulut birleştirmede `name + type` üzerinden tekilleştirilir):
     - *Gelir:* Maaş, Freelance / Ek İş, Yatırım / Faiz, Kira Geliri, Alacak Tahsilatı, Hediye / İade, Diğer Gelir.
     - *Gider:* Market, Yeme-İçme, Ulaşım / Yakıt, Faturalar, Kira / Konut, Sağlık, Giyim, Eğlence / Hobi, Abonelikler, Eğitim, Kişisel Bakım, Borç Ödeme, Diğer Gider.

3. **`transactions` (İşlemler)**
   - Alanlar: `type` (`income` | `expense` | `transfer`), `amount`, `currency`, `exchange_rate_to_base`, `base_amount` *(işlem anındaki ana para birimi karşılığı)*, `account_id`, `to_account_id` *(hesaplar arası transferde)*, `to_amount` *(farklı döviz transferinde hedef tutar)*, `category_id` *(transferde boş)*, `date`, `note`, `tags` (`text[]`), `receipt_uri`, `installment_plan_id`, `installment_number`, `recurring_rule_id`, `debt_id`, `goal_id`.
   - **Raporlama Kuralı:** Gelir ve gider raporları yalnızca `type IN ('income', 'expense')` işlemlerini toplar; `transfer` işlemleri (hesaplar arası transfer, kart borcu ödemesi ve kumbaraya aktarım) gelir veya gider toplamına **dahil edilmez**.

4. **`installment_plans` (Taksit Planları)**
   - Alanlar: `title`, `account_id`, `category_id`, `total_amount`, `currency`, `installment_count` *(2–24)*, `start_date`, `note`.
   - **Bölme Kuralı:** `installment_count` adet `expense` işlemi `start_date + 0, 1, ..., N-1 ay` tarihleriyle üretilir (not: `"1/6"`, `"2/6"`). Kuruş bölünmezse artık kuruş **ilk taksite** eklenir; taksitlerin toplamı kuruşu kuruşuna `total_amount` olur.

5. **`recurring_rules` (Düzenli Gelir / Fatura / Abonelikler)**
   - Alanlar: `title`, `type` (`income` | `expense`), `amount`, `currency`, `account_id`, `category_id`, `frequency` (`daily` | `weekly` | `monthly` | `yearly`), `next_run_date`, `auto_create` *(varsayılan `true`)*, `remind_days_before` *(varsayılan `2`)*, `is_active`.
   - Uygulama açılışında vadesi gelen (`next_run_date <= bugün`) aktif kurallar taranır: `auto_create = true` ise işlem oluşturulup tarih ilerletilir; `false` ise ana ekranda "Onay Bekleyenler" kartında tek tıkla onaya sunulur.

6. **`budgets` (Bütçe Limitleri) `[Tasarımcı Kararı]`**
   - Alanlar: `category_id` *(NULL ise genel aylık bütçe)*, `month` (`YYYY-MM`), `limit_amount`, `currency`, `alert_80_sent`, `alert_100_sent`.
   - Her ay için bağımsız satırlar tutulur (geçmiş ayların "Planlanan vs Gerçekleşen" grafiği sonradan değişmez, uyarı bayrakları her ay sıfırdan başlar). Yeni ayda **"Önceki Aydan Kopyala"** aksiyonu sunulur.
   - Bir bütçe, ilgili kategorideki **tüm para birimlerinden** harcamaları bütçenin para birimine çevirerek toplar.

7. **`savings_goals` (Birikim Hedefleri / Kumbara) `[Tasarımcı Kararı]`**
   - Alanlar: `name`, `target_amount`, `current_amount`, `currency`, `target_date`, `icon`, `color`, `is_completed`.
   - **Aktarım & Senkronizasyon Kuralı:** Bir hesaptan kumbaraya para ekleme/çekme işlemi `type = 'transfer'` ve `goal_id` bağlantısıyla kaydedilir (`to_account_id = NULL`). Böylece kumbaraya para ayırmak Aylık Gider'i artırmaz ve Tasarruf Oranını bozmaz. Hedefe bağlı bir işlem sonradan düzenlenir veya silinirse `current_amount` otomatik yeniden hesaplanır. Kumbara bakiyeleri `2A` gereği **Toplam Net Varlık** içinde yer alır (hesaptan çıkıp kumbaraya girdiği için net varlık tutarlı kalır).

8. **`debts` (Borç-Alacak Defteri) `[Tasarımcı Kararı]`**
   - Alanlar: `person_name`, `direction` (`owed_by_me` | `owed_to_me`), `total_amount`, `paid_amount`, `currency`, `due_date`, `note`, `is_settled`.
   - Kısmi ödeme desteklenir. Ödeme bir hesaba yansıtılırsa `debt_id` bağlı `expense` (`Borç Ödeme`) veya `income` (`Alacak Tahsilatı`) kaydı oluşur; bağlı işlem düzenlenir/silinirse `paid_amount` otomatik yeniden hesaplanır. `2A` gereği açık borç/alacaklar ana Net Varlık'a karıştırılmaz, Dashboard'da ayrı bir **"Borç / Alacak Özeti"** satırında gösterilir.

9. **`shared_reports` (Başkalarına Açılan Paylaşılabilir Raporlar — Kullanıcı Talebi)**
   - Alanlar: `id`, `user_id`, `share_token` *(kriptografik rastgele 32+ karakter benzersiz anahtar)*, `title`, `period_type` (`daily` | `weekly` | `monthly` | `yearly` | `custom`), `start_date`, `end_date`, `include_transactions` *(boolean — varsayılan `false`, sadece özet & grafikler)*, `include_notes` *(boolean — varsayılan `false`)*, `snapshot_json` *(paylaşım anında filtrelenmiş KPI + grafik serileri + izin verildiyse işlem özeti)*, `expires_at` *(7 gün / 30 gün / NULL süresiz)*, `is_revoked` *(boolean)*, `view_count`, `created_at`.
   - **Güvenlik Kuralı:** Ham finans tablolarına (`transactions`, `accounts`) asla genel okuma izni verilmez. Paylaşım linki (`/shared/[token]`) yalnızca Supabase üzerinde `SECURITY DEFINER` bir `get_shared_report(p_token)` RPC fonksiyonu çağırır; token geçerliyse, süresi dolmamışsa ve `is_revoked = false` ise sadece `snapshot_json` döndürülür. Kullanıcı tek tıkla linki iptal edebilir.

10. **`exchange_rates` & `user_settings`**
    - `user_settings`: `base_currency` (`TRY`), `theme` (`system` | `light` | `dark`), `privacy_mode`, `app_lock_enabled`, `notifications_enabled`, `month_start_day` *(1–28, varsayılan `1`)*.
    - **Çoklu Kur Değerlemesi (`[Tasarımcı Kararı]`):**
      - *Hesap bakiyeleri & Toplam Net Varlık:* Güncel/manuel kur ile **mark-to-market** hesaplanır.
      - *Dönemlik Gelir/Gider Raporları:* İşlem anındaki `base_amount` kullanılır.
      - *`base_currency` Değişimi:* Kullanıcı ana para birimini değiştirirse bütçeler ve rapor görüntülemeleri güncel çapraz kurlarla dönüştürülür (ekranda bilgilendirme gösterilir).
    - **Özel Ay Başlangıç Günü (`[Tasarımcı Kararı]`):** `month_start_day = 15` ise `2026-11` mali ayı `15 Kasım – 14 Aralık` aralığıdır. Yalnızca Özet KPI, Aylık Rapor ve Bütçe Limitlerine uygulanır; Takvim Görünümü (1–31) ve Yıllık Rapor (Ocak–Aralık) standart takvim düzeninde kalır.

---

### 5.3. Ekran Mimarisi ve Kullanıcı Akışları

Alt sekme çubuğu 5 ana noktadan oluşur:

```
┌───────────────────────────────────────────────────────────┐
│  [Özet]    [İşlemler]     ( + )     [Raporlar]  [Planla]  │
└───────────────────────────────────────────────────────────┘
```

1. **Özet (Dashboard)**
   - Üst bar: Senkronizasyon durumu rozeti (Bulut Bağlı / Çevrimdışı / Yerel Demo Modu), **Gizlilik Modu (göz ikonu)**, Ayarlar.
   - **Toplam Net Varlık Kartı (`2A`):** Tüm hesaplar + kumbaralar − kredi kartı toplam borcu; altında bu ayki Gelir / Gider / Net Akış ve ayrı satırda **Net Borç / Alacak Özeti**.
   - **Hesaplar Yatay Şeridi:** Nakit, Banka, Kredi Kartı (kullanılan/kalan limit barı), Yatırım kartları.
   - **Aylık Bütçe Nabzı:** Genel bütçe doluluğu, "Bu hızla ay sonu tahmini harcama" göstergesi ve limite yaklaşan ilk 3 kategori.
   - **Yaklaşan Ödemeler & Onay Bekleyenler:** Önümüzdeki 7 gündeki düzenli ödemeler, kart son ödeme tarihleri, vadesi yaklaşan borçlar.
   - **Son İşlemler:** Son 5 kayıt ve "Tümünü Gör".

2. **Hızlı Ekle (`+` Modalı)**
   - Üstte **Gider | Gelir | Transfer** sekmeleri; büyük numpad tutar girişi, para birimi seçici, son kullanılan hesap + hızlı kategori çipleri.
   - Açılır detaylar: Tarih, Not, Etiketler, **Taksit (Tek çekim / 2–24 ay)**, **Düzenli tekrar**, **Fiş Fotoğrafı** (kamera/galeri).
   - Kayıt anında optimistik UI güncellemesi + arka planda bulut senkronizasyonu.

3. **İşlemler (Transactions)**
   - **Liste Görünümü | Takvim Görünümü** geçişi; arama çubuğu + filtre çipleri (Dönem, Tür, Hesap, Kategori, Etiket, Tutar aralığı).
   - Liste görünümünde gün başlıklarında o günün net tutarı; Takvim görünümünde her günün altında mini +gelir/-gider özeti ve harcama yoğunluğu rengi.

4. **Raporlar, Grafikler & Paylaşım (Analytics)**
   - Dönem seçici: **Günlük | Haftalık | Aylık | Yıllık | Özel** + `< Önceki | Sonraki >` + hesap/kategori filtresi.
   - **KPI Şeridi:** Toplam Gelir, Toplam Gider, Net Tasarruf, Tasarruf Oranı (%), Günlük Ortalama Harcama ve önceki dönemle % değişim rozetleri.
   - **5 İnteraktif Grafik:**
     1. *Gelir & Gider Çubuk Grafiği* (dokunmatik detay tooltip).
     2. *Nakit Akışı / Kümülatif Trend Çizgi (Area) Grafiği*.
     3. *Kategori Dağılımı Donut Grafiği* (Gider/Gelir sekmesi; dilime dokununca o kategorinin işlemleri filtrelenir).
     4. *Bütçe Planlanan vs Gerçekleşen Yatay Bar Grafiği*.
     5. *Önceki Dönem Kıyaslama Özeti* (en çok artan / en çok azalan 3 kategori).
   - **Raporu Başkalarına Aç / Dışa Aktar Menüsü:**
     - **Canlı Paylaşım Linki Oluştur:** Başlık, geçerlilik süresi (7 gün / 30 gün / süresiz), gizlilik anahtarları (*"Sadece özet ve grafikleri göster"* / *"İşlem listesini de aç"* / *"Notları gizle"*). Oluşan link kopyalanır veya WhatsApp/Telegram'dan tek tıkla paylaşılır.
     - **PDF Raporu Paylaş / İndir** ve **CSV (Excel) Dışa Aktar**.

5. **Salt-Okunur Paylaşılan Rapor Sayfası (`/shared/[token]`)**
   - Giriş gerektirmeyen, mobil ve masaüstü uyumlu salt-okunur web ekranı: Rapor başlığı, dönem aralığı, KPI kartları, interaktif Gelir/Gider + Kategori Donut grafikleri ve (sahibi izin verdiyse) filtrelenmiş işlem tablosu. Süresi dolmuş veya iptal edilmiş linkte temiz bilgilendirme ekranı gösterilir.

6. **Planla (Hub) & Alt Ekranlar**
   - **Hesaplarım & Kredi Kartları**, **Bütçe Limitleri**, **Taksitlerim**, **Düzenli Ödemeler & Abonelikler**, **Birikim Hedefleri (Kumbara)**, **Borç & Alacak Defteri**, **Paylaşılan Raporlarım** *(aktif linkleri görüntüleme, görüntülenme sayısı, tek tıkla iptal etme)*, **Döviz & Altın Kurları**, **Ayarlar** *(Bulut Hesabı: E-posta+Şifre / Google ile Giriş, senkronizasyon, demo verisi yükle/sıfırla, Tema, Ana Para Birimi, Ay Başlangıç Günü, PIN & Biyometrik Kilit, Bildirimler, JSON Yedek/Geri Yükleme, Özel Kategoriler)*.

---

### 5.4. Kimlik Doğrulama, Bulut Senkronizasyonu ve Güvenlik

- **Giriş Yöntemleri (`1B`):**
  - **E-posta + Şifre** (kayıt, giriş, şifre sıfırlama).
  - **Google ile Giriş** (`expo-auth-session` + Supabase OAuth; Web ve Expo Go/native yönlendirme kurulumu `SUPABASE_SETUP.md` içinde adım adım anlatılır).
- **Offline-First & Senkronizasyon Politikası (`[Tasarımcı Kararı]`):**
  - Tüm okumalar/yazmalar anında yerel depodan yapılır; bulut oturumu açıksa değişiklikler `sync_queue` üzerinden Supabase'e itilir ve diğer cihazlardaki değişiklikler `updated_at` bazlı Last-Write-Wins ile çekilir.
  - **Demo İzolasyonu:** Demo verileri `is_demo = true` olarak işaretlenir ve bulut girişinde asla Supabase'e yüklenmez.
  - **Yerel ↔ Bulut Birleştirme:** Yerel modda gerçek veri biriktirmiş kullanıcı mevcut bulut hesabına giriş yaparsa tek seferlik **"Yerel verileri buluta ekle (Birleştir)"** veya **"Sadece bulut verilerini kullan"** seçimi sunulur. Çıkış yapıldığında gizlilik için yerel kullanıcı verisi temizlenir.
- **JSON Yedek / Geri Yükleme (`[Tasarımcı Kararı]`):**
  - Yapısal verileri (hesaplar, kategoriler, işlemler, taksitler, düzenli kurallar, bütçeler, hedefler, borçlar) dışa aktarır; fiş fotoğrafları bulutta Storage'da tutulur.
  - Geri yüklemede varsayılan seçenek **Güvenli Birleştir (Upsert)**, ikincil onaylı seçenek **Mevcut Veriyi Sıfırla ve Yedekten Yükle** (soft-delete + yeniden yükleme) olur.
- **Kurulum Kolaylığı:** Projede tek tıkla çalıştırılacak `supabase/schema.sql` (tüm tablolar + RLS + `get_shared_report` RPC + `receipts` Storage politikaları) ve Türkçe `SUPABASE_SETUP.md` (Supabase + Google OAuth + ücretsiz Vercel/Netlify web paylaşım yayını rehberi) yer alır. `.env` girilmemişse uygulama anında **Yerel / Demo Modunda** açılır.

---

### 5.5. Görsel ve UX Yönü (`[Tasarımcı Kararı]`)
- **Stil:** Modern, sakin fintech arayüzü; yüksek kontrastlı `tabular-nums` para formatı, yuvarlatılmış kartlar, net hiyerarşi.
- **Renkler:** Gelir Zümrüt Yeşili (`#10B981`), Gider Mercan Kırmızısı (`#EF4444`), Transfer Mavi/İndigo (`#3B82F6`), Bütçe Uyarı Kehribar (`#F59E0B`); Koyu Tema (`#0B1120` / `#111827`) ve Açık Tema (`#F8FAFC` / `#FFFFFF`).
- **Duyarlılık:** Telefonda tek sütunlu akıcı mobil düzen; Web/tablet ekranlarında geniş ve düzenli 2 sütunlu görünüm.

---

## 6. Geliştiriciye (Builder) Bırakılan Teknik Kararlar

- Expo Router dosya tabanlı yönlendirme yapısı (paylaşılan `/shared/[token]` web rotası dahil) ve klasör organizasyonu.
- State yönetimi (ör. Zustand) ve Android/iOS Expo Go + Web'de ortak çalışan yerel depolama adaptörü.
- Android + iOS Expo Go + Web uyumlu `react-native-svg` tabanlı interaktif grafik bileşenleri.
- Ücretsiz döviz/altın kur API sağlayıcısı ve fallback mekanizması.
- Finansal hesaplama motoru (bakiye, kredi kartı limiti/ekstresi, taksit bölme, çoklu kur, dönem agregasyonu, bütçe yüzdeleri, rapor snapshot üretimi) için kapsamlı birim test paketi.
