import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

// ==============================
// SOURCE = ancien projet inventaire-styro
// ==============================
const sourceConfig = {
  apiKey: "AIzaSyA28rAB3VDyylEX_MFRyqlZuAl8Nsxe2hs",
  authDomain: "inventaire-styro.firebaseapp.com",
  projectId: "inventaire-styro",
  storageBucket: "inventaire-styro.firebasestorage.app",
  messagingSenderId: "15818382324",
  appId: "1:15818382324:web:2d06f9ea3e693de0bc37a1",
  measurementId: "G-50XMPV7N2R",
};

// ==============================
// DESTINATION = projet maître bloc-lego
// ==============================
const destConfig = {
  apiKey: "AIzaSyCQxGJlYX-PHyX_QiLoVtYTlDiXln-9LaY",
  authDomain: "bloc-lego.firebaseapp.com",
  projectId: "bloc-lego",
  storageBucket: "bloc-lego.firebasestorage.app",
  messagingSenderId: "551752798435",
  appId: "1:551752798435:web:2848778b2bbe503b87b5d6",
  measurementId: "G-EP7LDMD2QB",
};

async function migrateBanquePanneaux() {
  const sourceApp = initializeApp(sourceConfig, "source-inventaire-styro");
  const destApp = initializeApp(destConfig, "dest-bloc-lego");

  const sourceDb = getFirestore(sourceApp);
  const destDb = getFirestore(destApp);

  try {
    console.log("Lecture de banquePanneaux dans inventaire-styro...");
    const sourceSnap = await getDocs(collection(sourceDb, "banquePanneaux"));

    if (sourceSnap.empty) {
      console.log("Aucun document trouvé dans banquePanneaux.");
      return;
    }

    console.log(`Documents trouvés: ${sourceSnap.size}`);

    let batch = writeBatch(destDb);
    let ops = 0;
    let total = 0;

    for (const snap of sourceSnap.docs) {
      const data = snap.data();

      const destRef = doc(
        destDb,
        "clients",
        "inventaire-styro",
        "banquePanneaux",
        snap.id
      );

      batch.set(
        destRef,
        {
          ...data,
          migratedAt: serverTimestamp(),
          migratedFrom: "inventaire-styro/banquePanneaux",
        },
        { merge: true }
      );

      ops += 1;
      total += 1;

      if (ops === 400) {
        console.log(`Commit batch... (${total} docs copiés)`);
        await batch.commit();
        batch = writeBatch(destDb);
        ops = 0;
      }
    }

    if (ops > 0) {
      console.log(`Commit final... (${total} docs copiés au total)`);
      await batch.commit();
    }

    console.log("✅ Migration terminée.");
    console.log(
      "Destination: clients / inventaire-styro / banquePanneaux"
    );
  } catch (err) {
    console.error("❌ Erreur migration:", err);
  } finally {
    await deleteApp(sourceApp);
    await deleteApp(destApp);
  }
}

migrateBanquePanneaux();