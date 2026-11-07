# Telusur recording kit: 15 voice notes and 10 label photos

For the Sea x OpenAI Codex Hackathon, 7 Nov 2026. Everything here is **simulated**: the sellers, shops and brands are made up and match the mock registry in the dataset. Record and shoot tonight; the files go into the repo in the first hour tomorrow.

## What each person does

| Person | Voice notes | Label photos to shoot |
|---|---|---|
| Galih | R01, R04, R07, R10, R13 | L01, L02, L04 |
| Alba | R02, R05, R08, R11, R14 | L01, L05, L07, L09 |
| Ardiyan | R03, R06, R09, R12, R15 | L03, L06, L08, L10 |

Label L01 is used by two recordings (R01 by Galih and R02 by Alba); Galih shoots it. Each photo is shot by the person who records its first voice note.

## Voice notes: how to record

- Record on your phone like a WhatsApp voice note: phone near your mouth, normal speaking voice, 20 to 60 seconds. Use the phone's own recorder app (iPhone Voice Memos, Android Recorder), which saves .m4a. If you record inside WhatsApp instead, convert with `ffmpeg -i in.opus out.m4a`.
- Say the script in your own words if you like, but keep **every ingredient, brand, variant and shop name** exactly as written, and keep the non-ingredients the script mentions (plastic, gas, oven): those test that intake leaves them out.
- The seller's name in the opening line isn't scored. Change it to fit your voice if you want.
- Say variants clearly: "Original", "Dark". These five recordings must come out with the exact variant: R01, R02, R03, R04, R05.
- Don't edit or trim. One take is fine; a stumble is realistic.
- File name: `R01_D01.m4a` (the name in the heading below). Save to `evals/intake/audio/`.

### R01 · Keripik Pisang Original (D01) · Galih

File `evals/intake/audio/R01_D01.m4a` · Style: clean, calm, the stage demo recording · Label photo: L01 (D01)

> Halo, assalamualaikum. Saya Sari, saya jualan keripik pisang original. Saya mau daftar sertifikat halal. Bahannya ada empat. Pisangnya pisang kepok, saya beli di pasar. Minyak gorengnya pakai Sentosa yang kemasan. Bumbu baladonya yang varian Original, saya ambil dari Toko Bumbu Jaya. Terus cabai bubuk, itu saya beli curah di pasar, nggak ada mereknya. Udah, itu aja. Makasih ya.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| bumbu balado | – | Original | processed | distributor · Toko Bumbu Jaya | yes |
| cabai bubuk | – | – | processed | market_stall | yes |

### R02 · Keripik Pisang Original (D01) · Alba

File `evals/intake/audio/R02_D01.m4a` · Style: messy: fillers, a self-correction, non-ingredients · Label photo: L01 (D01)

> halo halo, ini Bu Sari, kedengeran nggak ya. jadi gini, mau daftar halal buat keripik pisang yang original itu lho. pisangnya ya pisang kepok, beli di pasar pagi-pagi. terus bumbu balado, yang pedes, eh bukan bukan, yang original maksudnya, ambilnya dari Toko Bumbu Jaya langganan saya. minyak gorengnya Sentosa yang kemasan dua liter. plastik kemasannya beli di toko plastik sebelah, tapi itu bukan bahan ya. oh iya cabai bubuk, beli curah di pasar juga, nggak ada mereknya, ditimbang aja. gasnya elpiji biasa. udah itu aja bu.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| bumbu balado | – | Original | processed | distributor · Toko Bumbu Jaya | yes |
| cabai bubuk | – | – | processed | market_stall | yes |

Must **not** be extracted: plastik kemasan, gas elpiji.

### R03 · Keripik Pisang Original (D01) · Ardiyan

File `evals/intake/audio/R03_D01.m4a` · Style: Sundanese code-switching, fast, no label photo · Label photo: none, voice only

> Punten, ieu Bu Sari. Abdi bade daftar halal kanggo keripik pisang anu Original. Pisangna pisang kepok, meser di pasar. Minyak gorengna Sentosa, nu kemasan. Bumbu balado na nu Original, ti Toko Bumbu Jaya. Sareng cabai bubuk, meser curah di pasar, teu aya mereknya. Tos, kitu wae. Hatur nuhun.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| bumbu balado | – | Original | processed | distributor · Toko Bumbu Jaya | yes |
| cabai bubuk | – | – | processed | market_stall | yes |

### R04 · Keripik Pisang (D20) · Galih

File `evals/intake/audio/R04_D20.m4a` · Style: clean · Label photo: L02 (D20)

> Assalamualaikum, saya Sari. Ini buat keripik pisang saya yang dilapisi coklat. Bahannya pisang kepok dari pasar, minyak goreng Sentosa, sama coklat compound yang Dark, belinya di Toko Kue Sinar. Itu aja bahannya.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| coklat compound | – | Dark | processed | distributor · Toko Kue Sinar | yes |

### R05 · Keripik Pisang (D20) · Alba

File `evals/intake/audio/R05_D20.m4a` · Style: casual; names the wrong variant only to rule it out · Label photo: none, voice only

> eh iya, buat keripik pisang yang ada coklatnya itu ya. pisangnya kepok, dari pasar kayak biasa. minyak gorengnya Sentosa. coklatnya coklat compound, yang dark ya, bukan yang milk, saya ambil di Toko Kue Sinar. udah gitu doang sih.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| coklat compound | – | Dark | processed | distributor · Toko Kue Sinar | yes |

### R06 · Keripik Pisang (D02) · Ardiyan

File `evals/intake/audio/R06_D02.m4a` · Style: Javanese code-switching · Label photo: L03 (D02)

> Sugeng siang. Kulo Bu Sari, badhe daftar halal kangge keripik pisang. Bahane pisang kepok, tumbas wonten pasar. Minyak gorenge Sentosa. Kaliyan tepung terigu, mereke Makmur. Sampun, niku mawon. Matur nuwun.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang kepok | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed (or unknown) | certified_producer | yes |
| tepung terigu | Makmur | – | processed | certified_producer | yes |

### R07 · Makaroni Pedas (D05) · Galih

File `evals/intake/audio/R07_D05.m4a` · Style: Sundanese fillers, a market name that is not a supplier · Label photo: L04 (D05)

> Wilujeng siang, ieu Pak Ujang, nu jualan makaroni pedas. Bahanna makaroni, mereknya Nusa. Minyak goreng Sentosa. Terus cabai bubuk, abdi meser di Toko Cabe Rawit, dekat Pasar Baru. Tos, éta wungkul.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| makaroni | Nusa | – | processed | certified_producer | yes |
| minyak goreng | Sentosa | – | processed | certified_producer | yes |
| cabai bubuk | – | – | processed | distributor · Toko Cabe Rawit | yes |

### R08 · Makaroni Pedas (D06) · Alba

File `evals/intake/audio/R08_D06.m4a` · Style: clean, brand and shop for the same ingredient · Label photo: L05 (D06)

> Selamat siang, saya Pak Ujang. Untuk makaroni pedas, bahannya: makaroni merek Nusa, bawang putih yang segar dari pasar, dan bumbu balado merek Rasa Nusantara yang saya beli di Toko Sinar Bumbu. Terima kasih.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| makaroni | Nusa | – | processed | certified_producer | yes |
| bawang putih | – | – | fresh (or unknown) | market_stall | no (exempt) |
| bumbu balado | Rasa Nusantara | – | processed | distributor · Toko Sinar Bumbu | yes |

### R09 · Kerupuk Bawang (D07) · Ardiyan

File `evals/intake/audio/R09_D07.m4a` · Style: noisy: record in a kitchen or by a busy road · Label photo: L06 (D07)

> Halo, ini Bu Ani, yang bikin kerupuk bawang. Bawang putihnya beli di pasar, yang segar. Minyak gorengnya Sentosa. Tepung tapiokanya dari Toko Tani Jaya, dibungkus plastik biasa, nggak ada mereknya. Udah itu.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| bawang putih | – | – | fresh (or unknown) | market_stall | no (exempt) |
| minyak goreng | Sentosa | – | processed | certified_producer | yes |
| tepung tapioka | – | – | processed | distributor · Toko Tani Jaya | yes |

### R10 · Seblak Kering (D09) · Galih

File `evals/intake/audio/R10_D09.m4a` · Style: Sundanese, very casual, no label photo · Label photo: none, voice only

> Teh, ieu Teh Euis nu jualan seblak kering. Bahanna kerupuk mentah, meser di Toko Kerupuk Kang Asep. Cabai bubukna mereknya Cabai Prima, nu kemasan. Muhun, eta wungkul.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| cabai bubuk | Cabai Prima | – | processed | certified_producer | yes |
| kerupuk mentah | – | – | processed | distributor · Toko Kerupuk Kang Asep | yes |

### R11 · Seblak Kering (D10) · Alba

File `evals/intake/audio/R11_D10.m4a` · Style: mentions an ingredient she no longer uses · Label photo: L07 (D10)

> Halo, saya Euis, jualan seblak kering. Kerupuk mentahnya merek Sri Rejeki. Garamnya beli di pasar. Bumbu seblaknya dari Toko Bumbu Bu Imas. Dulu saya pakai kencur juga, tapi sekarang udah nggak. Itu aja.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| kerupuk mentah | Sri Rejeki | – | processed | certified_producer | yes |
| garam | – | – | unknown (or unknown) | market_stall | no (exempt) |
| bumbu seblak | – | – | processed | distributor · Toko Bumbu Bu Imas | yes |

Must **not** be extracted: kencur.

### R12 · Kue Nastar (D12) · Ardiyan

File `evals/intake/audio/R12_D12.m4a` · Style: mentions tools and equipment · Label photo: L08 (D12)

> Assalamualaikum, saya Lestari, saya bikin kue nastar. Telurnya telur ayam, beli di pasar. Tepung terigunya merek Makmur. Selai nanasnya dari Toko Bahan Kue Melati. Ovennya oven gas, loyangnya punya sendiri. Sudah, itu bahannya.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| telur ayam | – | – | fresh (or unknown) | market_stall | no (exempt) |
| tepung terigu | Makmur | – | processed | certified_producer | yes |
| selai nanas | – | – | processed | distributor · Toko Bahan Kue Melati | yes |

Must **not** be extracted: oven, loyang.

### R13 · Pisang Coklat (D14) · Galih

File `evals/intake/audio/R13_D14.m4a` · Style: fast, run-on, no punctuation in speech · Label photo: none, voice only

> iya halo ini Nining yang jualan pisang coklat jadi pisangnya pisang raja dari pasar kulit lumpianya merek Lumpia Mas terus coklat batangnya ambil di Toko Kue Sinar udah itu aja makasih

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| pisang raja | – | – | fresh (or unknown) | market_stall | no (exempt) |
| kulit lumpia | Lumpia Mas | – | processed | certified_producer | yes |
| coklat batang | – | – | processed | distributor · Toko Kue Sinar | yes |

### R14 · Permen Jelly (D16) · Alba

File `evals/intake/audio/R14_D16.m4a` · Style: mentions an ingredient she does not use · Label photo: L09 (D16)

> Selamat sore, saya Dewi, jualan permen jelly. Gulanya gula pasir merek Manis Jaya. Gelatinnya beli di Toko Bahan Kue Ceria. Pewarna nggak pakai ya, warnanya alami. Itu aja.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| gula pasir | Manis Jaya | – | processed | certified_producer | yes |
| gelatin | – | – | processed | distributor · Toko Bahan Kue Ceria | yes |

Must **not** be extracted: pewarna.

### R15 · Kacang Bawang (D19) · Ardiyan

File `evals/intake/audio/R15_D19.m4a` · Style: Javanese, fried shallots bought ready-made · Label photo: L10 (D19)

> Nuwun sewu, kulo Pak Darto, sadean kacang bawang. Kacang tanahe merek Kelinci Mas. Bawang gorenge tumbas sampun mateng teng pasar, teng Lapak Bawang Bu Tini. Sampun, niku mawon.

Gold answer (what intake must extract):

| Ingredient | Brand | Variant | Form | Supplier | Risky |
|---|---|---|---|---|---|
| kacang tanah | Kelinci Mas | – | processed | certified_producer | yes |
| bawang goreng | – | – | processed | market_stall · Lapak Bawang Bu Tini | yes |

## Label photos: how to shoot

The label photo is the back-of-pack label of the seller's own snack. **Don't photograph real products' labels.** Real labels name real brands and producers that aren't in the mock registry, so the agent couldn't verify them and the gold wouldn't match the scenarios. Instead, print our simulated labels and photograph them on real packaging:

1. **Buy:** a pack of 10 plain kraft or clear standing pouches (about 12×20 cm, any stationery or packaging shop, or Shopee), or reuse 10 empty snack packets. One plastic cookie jar for L08.
2. **Print** each PNG from `recording-kit/labels-to-print/` at about 9×10 cm (A4, 2 per page is fine), colour or black and white.
3. **Stick** the label on the pouch with tape. Cover any real brand printed on the packet, so it doesn't end up in the photo.
4. **Shoot** with your phone camera: default settings, no flash, no filters, no cropping, label filling about two thirds of the frame. Follow the shot note for each label; the variety is on purpose.
5. **Save** as `L01_D01.jpg` (name below) in `evals/intake/photos/`. If a photo is missing tomorrow, the code can fall back to the `.sim.png` render in the same folder.

| Photo | Product (scenario) | Printed composition | Shot note | Used with |
|---|---|---|---|---|
| `L01_D01.jpg` | Keripik Pisang Original (D01) | Pisang kepok, minyak goreng (Sentosa), bumbu balado Original, cabai bubuk. | Flat on a table, straight on, daylight from a window. | R01, R02 |
| `L02_D20.jpg` | Keripik Pisang Coklat (D20) | Pisang kepok, minyak goreng (Sentosa), coklat compound Dark. | Hand-held, pouch held up in one hand, slight tilt. | R04 |
| `L03_D02.jpg` | Keripik Pisang Manis (D02) | Pisang kepok, tepung terigu (Makmur), minyak goreng (Sentosa). | Under a ceiling lamp so there is a little glare on the plastic; keep the text readable. | R06 |
| `L04_D05.jpg` | Makaroni Pedas Level 3 (D05) | Makaroni (Nusa), minyak goreng (Sentosa), cabai bubuk. | Straight on, on a patterned tablecloth. | R07 |
| `L05_D06.jpg` | Makaroni Pedas Balado (D06) | Makaroni (Nusa), bawang putih, bumbu balado (Rasa Nusantara). | Pouch standing up, photo taken from slightly above. | R08 |
| `L06_D07.jpg` | Kerupuk Bawang Gurih (D07) | Tepung tapioka, bawang putih, minyak goreng (Sentosa). | At about a 20 degree angle, as if snapped quickly. | R09 |
| `L07_D10.jpg` | Seblak Kering Pedas (D10) | Kerupuk mentah (Sri Rejeki), garam, bumbu seblak. | Evening indoor light, no flash. | R11 |
| `L08_D12.jpg` | Kue Nastar Lebaran (D12) | Tepung terigu (Makmur), telur ayam, selai nanas. | Label stuck on a plastic cookie jar instead of a pouch; shoot the jar. | R12 |
| `L09_D16.jpg` | Permen Jelly Buah (D16) | Gula pasir (Manis Jaya), gelatin. | Crumple the pouch a little first, then shoot straight on. | R14 |
| `L10_D19.jpg` | Kacang Bawang Renyah (D19) | Kacang tanah (Kelinci Mas), bawang goreng. | Held next to a few loose peanuts on the table, straight on. | R15 |

The gold answer for a photo is the gold of the recording it's used with: the label adds brands and variants, the voice note adds suppliers.

## Where the files go

```
evals/intake/audio/R01_D01.m4a … R15_D19.m4a       # you record these (15)
evals/intake/photos/L01_D01.jpg … L10_D19.jpg      # you shoot these (10)
evals/intake/photos/L01_D01.sim.png …              # already in the dataset: rendered fallbacks
evals/intake/gold/R01_D01.yaml …                   # already in the dataset: gold answers
evals/intake/transcripts/R01_D01.txt …             # already in the dataset: the scripts above
```

Put your files into the dataset folder at `shopee-ai-hackathon/telusur-dataset/repo/evals/intake/` (or a shared drive with the same layout, PRD S0-12) so every laptop can reach them. Before you finish, play each recording once and check each photo is sharp enough to read the composition.

## Before the demo

- R01 + L01 is the stage recording (M6, `make demo-voice`). If its transcript drops "Original" in the S0-03 test, re-record R01 more slowly; R02 and R03 are the backups.
- Real WhatsApp replies for the held-out set and the problem slide are separate (Alba, S0-09) and need the sender's permission plus anonymised names, shops, numbers and addresses.
