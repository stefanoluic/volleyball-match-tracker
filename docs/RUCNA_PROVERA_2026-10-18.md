# Ručna provera — 18. oktobar 2026.

Provera je izvršena kroz stvarni interfejs lokalno pokrenute aplikacije.
Unosi nisu zaobiđeni direktnim upisom rezultata u bazu niti pozivanjem API-ja.
Statističar i stručni štab korišćeni su u odvojenim sesijama preko adresa
`localhost:5173` i `127.0.0.1:5173`. Dodatni tab istog porekla poslužio je
za proveru zajedničke sesije i odjave.

## Provereno

- Pogrešna lozinka se odbija. Prelazak na registraciju uklanja grešku prijave.
- Registracija odbija brojeve i posebne znakove u imenima, mejl bez nastavka
  domena i različite lozinke; prihvata unutrašnji razmak i crticu u imenima.
- Novi probni nalog ne može da se prijavi pre odobrenja. Administrator ga
  odobrava, nakon čega prijava uspeva. Blokiranje prekida već otvorenu sesiju
  pri sledećem zahtevu. Potvrda trajnog brisanja je otvorena pa otkazana.
- Kreiranje i izmena probnog tima i igrača rade. Prazna obavezna polja i
  dupliran broj dresa se odbijaju. Posle greške ostaju uneti podaci.
- Stručni štab nema kontrole za izmenu timova, igrača ili toka utakmice.
- Nova utakmica koristi dva različita tima. Sačuvani su učesnici, po jedan
  libero po timu, početne šestorke i prvi servis. Nepotpune postave se odbijaju,
  a prijavljeni libero nije ponuđen za početnu šestorku.
- Pokretanje zakazane utakmice postaje vidljivo stručnom štabu bez osvežavanja.
  Poen primaoca menja servis i rotaciju; poništavanje vraća prethodno stanje.
- Uneti su as, blok, napadi i greška protivnika. As se pripisuje serveru,
  blok nudi prednju liniju, a greška igrača protivničku šestorku. Tim dobija
  poen greškom protivnika bez pripisivanja tog poena svom igraču.
- Izmena servera ažurira teren i prikaz drugog korisnika. Povratak početnog
  igrača moguć je samo umesto odgovarajuće rezerve. Poništavanje izmene vraća
  igrača i broj izmena. Kasnija promena postave blokira poništavanje ranijeg
  poena dok se ta promena ne poništi.
- Libero ulazi samo umesto ponuđenih igrača zadnje linije koji ne serviraju.
  Neposredan povratak bez poena nije ponuđen. Posle poena može da se vrati
  tačno pokriveni igrač. Broj običnih izmena ostaje nepromenjen.
- Poeni, poništavanja, obične izmene i libero vidljivi su stručnom štabu
  preko automatskog osvežavanja. Statistika prati isti tok događaja.
- Na deset važećih poena pojavila se preporuka o koncentraciji osvojenih
  poena. Poništavanje desetog poena uklanja preporuku zbog premalog uzorka.
  Kasniji unos velikog broja poena bez detalja prikazuje upozorenje o pokrivenosti
  umesto nepouzdanih preporuka.
- Utakmica je kroz interfejs završena 3:0, sa setovima 25:0, 25:0, 25:0.
  Završni poen blokira nove poene, ali ostavlja potvrdu kraja seta. Sledeći
  set dobija nove postave, rezultat 0:0 i naizmeničan prvi servis.
- Stručni štab je ručno ostao na prvom setu tokom drugog i trećeg. Statistika
  cele utakmice prešla je sa 74 na konačnih 75 poena bez promene izabranog seta.
  Za prvi set statistika pokazuje 25 poena, za celu utakmicu 75. Poništeni
  poeni ne ulaze u zbir. Posle zatvaranja seta nema komandi za nove poene
  ili njihovo poništavanje.
- Pri odjavi iz drugog taba prvi gubi pristup pri narednom zahtevu. Poruku
  o istekloj sesiji zatim zamenjuje nova greška prijave; prelazak na registraciju
  uklanja obe poruke. Ponovna ispravna prijava uspeva.
- Na uskom prikazu (390 px) pregled utakmice i statistika ostaju čitljivi;
  širina dokumenta ne prelazi vidljivu širinu. Tabele imaju zaseban prostor
  za horizontalno pomeranje. Privremena širina pregledača je potom vraćena.
- U konzolama oba glavna testna taba nisu zabeležena upozorenja ili greške.

## Ispravka

U formi utakmice uklonjena je zastarela tvrdnja da će praćenje rezultata biti
dodato kasnije. Nova poruka upućuje na prijavu sastava, izbor početnih postava
i potvrdu početka. Promena je ponovo proverena u pregledaču.

## Granice provere

Nisu ručno izvršeni trajno brisanje, prekid mreže/servera, opterećenje većim
brojem korisnika, ceo tok 3:2 ili izjednačenje. Za neke od tih slučajeva postoje
odvojeni automatski testovi; ovo nije tvrdnja da su ručno isprobani svi putevi.
PDF izveštaj i javno postavljanje ostaju van obima.

## Podaci koji su ostali u lokalnoj bazi

- Blokirani nalog `proba.rucna.20261018@example.com` (Ana Marija Proba-Test).
- Tim `PROBA UI 18-10` sa jednim igračem Marko-Proba Test Igrač, broj 8.
- Završena probna utakmica OK Vojvodina — OK Partizan, 18. 10. 2026. u 18:45.

Ranija utakmica, postojeći igrači i korisnički nalozi nisu menjani.
Lozinke nisu deo ovog zapisa. Probni podaci iz baze i lokalni snimci ne ulaze u Git.
