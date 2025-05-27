require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const app = express();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.PROJECT_ID,
    privateKey: process.env.PRIVATE_KEY.replace(/\n/g, '\n'),
    clientEmail: process.env.CLIENT_EMAIL
  }),
  databaseURL: 'https://shopee-express-project.firebaseio.com'
});
const db = admin.firestore();

app.use(express.static('public'));
app.use(express.json());

app.get('/api/deliveries', async (req, res) => {
  try {
    const snapshot = await db.collection('deliveries').get();
    const deliveries = snapshot.docs.map(doc => doc.data());
    res.json(deliveries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/validateKurir', async (req, res) => {
  try {
    const { idMitra, nik } = req.body;
    const snapshot = await db.collection('kurir').where('idMitra', '==', idMitra).where('nik', '==', nik).get();
    if (snapshot.empty) {
      res.json({ valid: false });
    } else {
      res.json({ valid: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/simpanData', async (req, res) => {
  try {
    const payload = req.body;
    const timestamp = new Date().toISOString();
    const totalPaket = payload.barcodes.length;
    const jumlahTerkirim = Object.keys(payload.foto).filter(key => !key.includes('pending_')).length;
    const jumlahPending = totalPaket - jumlahTerkirim;
    const persentase = totalPaket > 0 ? ((jumlahTerkirim / totalPaket) * 100).toFixed(2) : 0;

    await db.collection('deliveries').add({
      timestamp,
      idMitra: payload.id,
      nama: payload.nama,
      nik: payload.nik,
      totalPaket,
      cod: payload.cod,
      noncod: payload.noncod,
      barcodes: payload.barcodes,
      foto: payload.foto,
      jumlahTerkirim,
      jumlahPending,
      persentase
    });

    const batch = db.batch();
    payload.barcodes.forEach(barcode => {
      const docRef = db.collection('barcodeDetails').doc();
      batch.set(docRef, {
        timestamp,
        idMitra: payload.id,
        barcode,
        status: payload.foto[barcode] ? (barcode.includes('pending_') ? 'Pending' : 'Terkirim') : 'Proses',
        foto: payload.foto[barcode] || ''
      });
    });
    await batch.commit();

    res.json({ message: 'Data berhasil disimpan!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
app.post('/api/uploadFoto', async (req, res) => {
  try {
    const { fileData, barcode, idMitra } = req.body;
    const bucket = storage.bucket('shopee-express-photos');
    const file = bucket.file(`${idMitra}/${barcode}.jpg`);
    await file.save(Buffer.from(fileData.split(',')[1], 'base64'), { contentType: 'image/jpeg' });
    await file.makePublic();
    const url = `https://storage.googleapis.com/shopee-express-photos/${idMitra}/${barcode}.jpg`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));