# Bütçe Pro — Supabase & Bulut Kurulum Rehberi

Bu rehber, **Bütçe Pro** uygulamasını ücretsiz **Supabase** katmanıyla buluta bağlamak, **E-posta + Şifre** ve **Google ile Giriş** kimlik doğrulamasını açmak ve paylaşılabilir canlı rapor linkleri (`/shared/[token]`) için ücretsiz web yayını yapmak üzere adım adım hazırlanmıştır.

> **Not:** `.env` dosyası doldurulmasa bile uygulama **Yerel / Demo Modunda** tüm özellikleriyle çalışmaya devam eder. Bulut senkronizasyonu ve herkese açık canlı rapor linkleri için aşağıdaki adımları tamamlayın.

---

## 1. Ücretsiz Supabase Projesi Oluşturma

1. [https://supabase.com](https://supabase.com) adresine gidin ve ücretsiz hesapla giriş yapın.
2. **New Project** butonuna tıklayın.
3. Proje adı olarak örneğin `butce-pro` girin, güçlü bir veritabanı şifresi belirleyin ve size en yakın bölgeyi (ör. `Frankfurt (eu-central-1)`) seçin.
4. Proje hazır olduğunda **Project Settings → API** bölümünden şu iki değeri not alın:
   - **Project URL** (`EXPO_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)

---

## 2. Veritabanı Şemasını ve Güvenlik Politikalarını Kurma

1. Supabase panelinde sol menüden **SQL Editor** sekmesine girin.
2. **New query** oluşturun.
3. Bu projedeki [`supabase/schema.sql`](./supabase/schema.sql) dosyasının tüm içeriğini kopyalayıp editöre yapıştırın ve **Run** butonuna basın.
4. Bu tek komut şunları otomatik olarak oluşturur:
   - 11 tablo: `accounts`, `categories`, `transactions`, `installment_plans`, `recurring_rules`, `budgets`, `savings_goals`, `debts`, `shared_reports`, `user_settings`, `exchange_rates`
   - Tüm tablolarda `auth.uid() = user_id` bazlı **Row Level Security (RLS)** izolasyonu
   - Sadece filtrelenmiş `snapshot_json` döndüren güvenli `get_shared_report(p_token)` RPC fonksiyonu
   - Fiş fotoğrafları için kullanıcı klasörüne kilitli özel (`public = false`) `receipts` Storage bucket'ı

---

## 3. Kimlik Doğrulama (E-posta + Şifre & Google ile Giriş)

### A. E-posta + Şifre
1. Supabase panelinde **Authentication → Providers → Email** bölümüne gidin.
2. **Enable Email provider** seçeneğinin açık olduğunu doğrulayın.
3. Geliştirme sırasında hızlı test için isterseniz **Confirm email** seçeneğini geçici olarak kapatabilir, canlı kullanımda açık bırakabilirsiniz.

### B. Google ile Giriş (Web + Expo Go)
1. [Google Cloud Console](https://console.cloud.google.com/) üzerinde bir proje seçin veya oluşturun.
2. **APIs & Services → OAuth consent screen** üzerinden uygulama adını (`Bütçe Pro`) ve destek e-postasını tanımlayın.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** adımlarını izleyin:
   - Uygulama türü: **Web application**
   - **Authorized redirect URIs** alanına Supabase panelindeki (**Authentication → Providers → Google**) **Callback URL** değerini ekleyin:
     `https://<PROJE-REF>.supabase.co/auth/v1/callback`
4. Oluşan **Client ID** ve **Client Secret** bilgilerini Supabase **Authentication → Providers → Google** ekranına yapıştırıp kaydedin.
5. Supabase **Authentication → URL Configuration** ekranında **Redirect URLs** listesine şu adresleri ekleyin:
   - Web yerel geliştirme: `http://localhost:8081/**`
   - Expo özel şema: `butceapp://**`
   - Expo Go geliştirme yönlendirmesi (Expo AuthSession proxy / yerel ağ adresi): `exp://**`
   - Canlı web yayın adresiniz (varsa): `https://<uygulama-adiniz>.vercel.app/**`

---

## 4. `.env` Dosyasını Yapılandırma

Proje kök dizininde `.env.example` dosyasını `.env` olarak kopyalayın ve bilgilerinizi girin:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<PROJE-REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE-ANON-KEY>
EXPO_PUBLIC_WEB_BASE_URL=http://localhost:8081
```

> `.env` dosyası `.gitignore` içinde yer aldığı için Git deposuna gönderilmez.

Canlı web yayını yaptıktan sonra `EXPO_PUBLIC_WEB_BASE_URL` değerini canlı alan adınızla (ör. `https://butce-pro.vercel.app`) güncelleyin; böylece mobil uygulamadan oluşturulan `/shared/[token]` paylaşım linkleri doğrudan herkesin açabileceği canlı adresi gösterir.

---

## 5. Ücretsiz Web Yayını (Vercel / Netlify) — Canlı `/shared/[token]` Linkleri İçin

Paylaşılan rapor linklerinin (`/shared/[token]`) başka kullanıcılar tarafından tarayıcıdan giriş yapmadan açılabilmesi için Expo Web çıktısını ücretsiz olarak yayınlayabilirsiniz:

1. Statik web çıktısını üretin:
   ```bash
   npx.cmd expo export --platform web
   ```
   Çıktı `dist/` klasörüne oluşturulur.

2. **Vercel ile Yayınlama (Önerilen):**
   - Vercel'de `dist` çıktısını yayınlayın veya GitHub reponuzu bağlayıp Build Command olarak `npx expo export --platform web`, Output Directory olarak `dist` tanımlayın.
   - Dinamik `/shared/[token]` rotalarının SPA olarak açılabilmesi için `vercel.json` içine yönlendirme ekleyin:
     ```json
     {
       "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
     }
     ```
   - Vercel Environment Variables kısmına `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` ve `EXPO_PUBLIC_WEB_BASE_URL` değişkenlerini ekleyin.

3. **Netlify ile Yayınlama (Alternatif):**
   - Build Command: `npx expo export --platform web`
   - Publish Directory: `dist`
   - `dist/_redirects` (veya `public/_redirects`) içine `/* /index.html 200` kuralını ekleyin.

---

## 6. Uygulamayı Çalıştırma

- **Web:** `npm.cmd run web`
- **Expo Go (Android / iOS QR):** `npm.cmd start`
- **Birim Testleri:** `npm.cmd test`
- **Tip Kontrolü:** `npm.cmd run typecheck`
