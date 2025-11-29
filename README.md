# canzoniere

Viewer per canzoni e accordi.

## Come provarlo in locale

Il progetto è una pagina statica. Per visualizzarla senza dipendenze aggiuntive:

1. Clona il repository:
   ```bash
   git clone https://github.com/asolinas/canzoniere.git
   cd canzoniere
   ```
2. Avvia un piccolo server statico (qualunque server HTTP va bene). Ad esempio con Python:
   ```bash
   python -m http.server 3000
   ```
3. Apri il browser su http://localhost:3000 e carica la pagina `index.html`.

> Nota: l'elenco dei brani viene caricato da GitHub. Assicurati di avere connessione a Internet per vedere la lista automatica e,
> se serve, usa il pulsante "Scarica tutto in ZIP" (subito sotto l'elenco nella barra laterale) per salvare localmente la cartella `songs`.

## Deploy su Netlify

Netlify può pubblicare direttamente la cartella del progetto: imposta `index.html` come entry point e non è necessario alcun build step.
