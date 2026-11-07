# Cakupan evaluasi makanan

Status implementasi dan bukti pengujian harus dibedakan. Evaluator yang berhasil menemukan prediksi salah bukan bukti bahwa model sudah diperbaiki.

| Area | Cakupan yang tersedia | Hasil/batas saat ini |
| --- | --- | --- |
| Pengenalan jenis makanan dan bahan terlihat | Lima kasus awal, checksum, scorer, laporan per sumber | Rerun 4/5; gambar label masih salah diterima |
| Foto ambigu, glare dan kemasan transparan | Foto sale pisang dari pengguna, manifest field terpisah | Dua run salah: keripik kulit dan ikan asap; abstain diperbolehkan tetapi tidak dipilih |
| Kualitas foto tidak memadai | PNG kosong + satu foto nyata dengan pantulan/occlusion | Belum mewakili variasi blur, gelap, sudut dan perangkat |
| Bahan tersembunyi/duplikat | Required/optional visible gold, must-not-infer, precision/recall | Minyak, tepung dan gula tidak otomatis menjadi gold berdasarkan nama makanan |
| Koreksi sebelum konfirmasi | Fixture salah tempe mendoan/kedelai → editor sale pisang/pisang | Lulus: current recipe dan HTML/JSON memakai jawaban penjual; tebakan tidak menjadi bukti |
| Koreksi setelah konfirmasi | Perubahan revisi, penolakan request lama | Lulus dengan fixture; permintaan bukti lama tidak dapat mengubah resep yang sudah direvisi |
| Klarifikasi setelah abstain | Editor kosong diisi penjual | Lulus dengan fixture; tidak menambahkan bahan tersembunyi otomatis |
| Browser dan replay | Foto asli, edit jawaban uji, unduh HTML/JSON/trace, replay | Lulus pada Chrome 390 × 844; jawaban pisang saja adalah fixture minimal, bukan resep asli lengkap |
| Review manusia | `--require-reviewed` | Menolak semua anotasi draft sebelum model dipanggil; belum ada anotasi baru berstatus reviewed |
| Evaluasi independen | `split: independent`, `prior_exposure: unseen`, `--independent`, anotasi reviewed wajib | Infrastruktur tersedia; belum dijalankan dengan data independen |
| Resep asli dan foto penjual baru | `recipe_reference` dan panduan pengumpulan | Belum ada resep asli lengkap yang dikonfirmasi; tidak boleh digantikan resep umum hasil tebakan |
| Percakapan koreksi langsung dengan AI | Tidak ada dalam kontrak aplikasi saat ini | Pengujian koreksi mengukur editor/service; bukan kemampuan model merevisi jawaban percakapan |

## Perintah

```sh
npm run eval:dishes -- --validate
npm run eval:dishes
npm run eval:dishes:field -- --validate
npm run eval:dishes:field
npm run eval:corrections
npm run eval:dishes -- --require-reviewed
```

Field eval memerlukan foto privat di `.run/dish-eval-inputs/sale-pisang.jpg` dengan checksum dalam `datasets/dish-photos/field-manifest.json`. Foto sudah disalin lokal untuk pengujian ini, tidak masuk Git, dan tidak boleh dianggap aset publik. Checkout lain harus memperoleh foto melalui izin pemiliknya. Tanpa foto, validasi gagal; run biasa mencatat asset failure dan exit nonzero, tidak mengklaim kasus lulus atau diam-diam melewatinya.

`eval:corrections` tidak memanggil API dan tidak mengukur akurasi model. Saran awal dan resep penjual pada suite ini merupakan fixture terkontrol untuk menguji mutasi sesi, revisi, pemisahan bukti dan ekspor.

Runner mengeluarkan laporan JSON ke stdout dan telemetry ke stderr. Gunakan pemanggilan Node langsung jika menginginkan stdout tanpa header `npm`.

## Data yang masih perlu dikumpulkan evaluator

Untuk setiap makanan baru, minta pembuat memberikan nama, foto asli, komposisi sebenarnya, izin penggunaan, dan catatan proses yang relevan. Ambil foto jelas serta kondisi sulit yang benar-benar terjadi (plastik, glare, gelap, blur, sudut lain). Tetapkan label sebelum melihat output model. Pasangkan makanan yang mudah tertukar; sertakan juga benda non-makanan dan beberapa makanan dalam satu foto.

Pisahkan:

- **Jenis makanan yang dikonfirmasi pembuat**, misalnya sale pisang.
- **Bahan terlihat** yang dapat dinilai dari gambar.
- **Resep lengkap** yang dikonfirmasi pembuat, termasuk bahan tersembunyi; jangan menjadikannya kewajiban pembacaan visual.
- **Perilaku yang diharapkan**: identifikasi pada foto jelas; identifikasi benar atau abstain pada foto ambigu; reject pada gambar yang bukan satu masakan.

Sale pisang sudah dikenal oleh tim dan model dalam percakapan ini sehingga tetap development. Jangan memindahkannya ke set independen hanya dengan mengganti label split. Metadata `unseen` merupakan pernyataan evaluator, bukan pembuktian otomatis bahwa data tidak pernah dipakai sebelumnya.

Untuk evaluasi independen, pemilik eval harus menyiapkan manifest dan foto baru di lokasi privat terpisah. Semua anotasi harus reviewed dan setiap kasus dinyatakan `prior_exposure: unseen`. Jalankan hanya atas instruksi eksplisit pemilik dataset:

```sh
node --env-file-if-exists=.env --import tsx demo/eval-dishes.ts /path/privat/manifest.json --independent
```

Perintah ini adalah contoh penggunaan di masa depan; arsip held-out lama tidak dibuka atau diubah dalam pekerjaan ini. Jangan tuning terhadap set independen setelah melihat hasilnya. Catat kegagalan untuk perbaikan berikutnya, lalu gunakan set baru untuk pengukuran independen berikutnya.

## Temuan terbuka

1. Foto label dapat disalahartikan sebagai makanan; lihat `reject-001`.
2. Sale pisang dalam plastik menghasilkan tebakan makanan/bahan yang salah dan tidak konsisten. Model belum memilih abstain secara andal.
3. Tidak ada resep lengkap terverifikasi maupun evaluasi independen baru. Hasil kecil ini tidak mendukung klaim akurasi umum.

Model/prompt produksi tidak diubah dalam perluasan eval ini. Laporan awal dipertahankan, bukan diganti dengan run yang terlihat lebih baik.
