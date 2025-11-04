import puppeteer from "puppeteer";
import fs from "fs";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";

type AnuntType = {
  titlu: string;
  pret: string;
  link: string;
  oras: string;
  suprafata: string | null;
  meta: string;
};

const URL_BASE =
  "https://www.olx.ro/imobiliare/apartamente-garsoniere-de-vanzare/bucuresti-ilfov-judet/?currency=EUR&page=${PAGE}";

const STATE_FILE = "stare.json";
const CSV_FILE = "anunturi.csv";

async function colecteazaOLX() {
  const browser = await puppeteer.launch({ headless: true });
  const paginaDeVizionare = await browser.newPage();

  let numarulPaginiVizitate = await citesteUltimaPaginaVizitata();
  console.log("Incepem de la pagina: ", numarulPaginiVizitate);

  while (true) {
    const url = URL_BASE.replace("${PAGE}", numarulPaginiVizitate.toString());
    console.log("Navigam la URL: ", url);

    await paginaDeVizionare.goto(url, {
      waitUntil: "networkidle2",
    });

    const existaPaginba = await paginaDeVizionare.$("div[data-cy='l-card']");
    if (!existaPaginba) {
      console.log("Nu mai sunt anunturi de vizitat.");

      break; // iesim din repetitie ( while )
    }

    // extragem datele din fiecare anunt ...
    const anunturi: AnuntType[] =
      (await paginaDeVizionare.evaluate(() => {
        return Array.from(
          document.querySelectorAll("div[data-cy='l-card']")
        ).map((el) => {
          const titlu =
            (el.querySelector("h6") as HTMLElement)?.innerText.trim() ||
            (el.querySelector("h4") as HTMLElement)?.innerText.trim();

          const pret = (
            el.querySelector("p[data-testid='ad-price']") as HTMLElement
          )?.innerText.trim();
          const link = el.querySelector("a")?.href || "";
          const locatie =
            (
              el.querySelector("p[data-testid='location-date']") as HTMLElement
            )?.innerText.trim() || "";
          const oras = locatie.split("-")[0]?.trim() || "";
          const meta =
            (
              el.querySelector("span[data-testid='ad-meta']") as HTMLElement
            )?.innerText.trim() || "";
          let suprafata = null;
          const divuri = el.querySelectorAll(
            "div[color='text-global-secondary']"
          );
          for (const d of divuri) {
            const text = (d as HTMLElement).innerText.trim();
            const match = text.match(/\d+\s*m²/i);
            if (match) {
              suprafata = match[0];
              break;
            }
          }

          return { titlu, pret, oras, suprafata, link, meta };
        });
      })) || [];

    console.log(
      `Am gasit ${anunturi.length} anunturi pe pagina ${numarulPaginiVizitate}.`
    );

    // salvam anunturile in fisierul CSV
    await scrieAnunturiInCSV(anunturi);

    // curatam anunturile pentru altele noi
    anunturi.length = 0;

    // salvam starea - ultima pagina vizitata
    numarulPaginiVizitate += 1;
    await salveazaUltimaPaginaVizitata(numarulPaginiVizitate);

    // ne oprim dupa 5 pagini pentru testare
    if (numarulPaginiVizitate > 5) {
      console.log("Am atins limita de pagini pentru testare. Oprim.");
      break;
    }
  }

  await browser.close();
}

async function citesteUltimaPaginaVizitata() {
  // verifica daca exista fisierul , daca nu , il creem cu pagina 1
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pagina: 1 }));
    return 1;
  }
  const paginaRamasa = fs.readFileSync(STATE_FILE, "utf-8");

  return JSON.parse(paginaRamasa).pagina || 1;
}

async function salveazaUltimaPaginaVizitata(pagina: number) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ pagina }));
}

async function scrieAnunturiInCSV(anunturi: AnuntType[]) {
  // daca nu exista fisierul, il creem si adaugam header, daca exista, doar adaugam datele
  const csvWriter = createCsvWriter({
    path: CSV_FILE,
    header: [
      { id: "titlu", title: "Titlu" },
      { id: "pret", title: "Pret" },
      { id: "oras", title: "Oras" },
      { id: "suprafata", title: "Suprafata" },
      { id: "link", title: "Link" },
    ],
    append: fs.existsSync(CSV_FILE),
  });

  await csvWriter.writeRecords(anunturi);

  console.log(`Datele au fost salvate în fișierul ${CSV_FILE}`);
}
colecteazaOLX();
