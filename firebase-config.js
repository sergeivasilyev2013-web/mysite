(function () {
  "use strict";

  // Public web config from the Firebase console (Project settings → General →
  // Your apps). This is meant to be public — access is enforced by the
  // Firestore security rules (only the admin's own email can read orders),
  // not by keeping this value secret.
  var firebaseConfig = {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME.firebaseapp.com",
    projectId: "REPLACE_ME",
    storageBucket: "REPLACE_ME.appspot.com",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME"
  };

  // Until the real config above is filled in, the site works exactly as
  // before: orders just don't get an extra cloud copy for the admin panel.
  if (!window.firebase || firebaseConfig.apiKey === "REPLACE_ME") return;

  firebase.initializeApp(firebaseConfig);
  window.MZ_DB = firebase.firestore();
})();
