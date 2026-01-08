import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";

import Login from "./Login.jsx";
import PageRetourMateriaux from "./PageRetourMateriaux.jsx";
import PageTableauMoulure from "./PageTableauMoulure.jsx";

export default function App() {
  const [route, setRoute] = useState("ajout"); // "ajout" | "tableau"
  const [user, setUser] = useState(undefined); // undefined = loading auth

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
    });
    return () => unsub();
  }, []);

  // petit écran “loading”
  if (user === undefined) {
    return (
      <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
        Chargement...
      </div>
    );
  }

  // pas connecté => login
  if (user === null) {
    return <Login />;
  }

  // connecté => app
  if (route === "tableau") {
    return <PageTableauMoulure onRetour={() => setRoute("ajout")} />;
  }

  return <PageRetourMateriaux onGoTableau={() => setRoute("tableau")} />;
}
