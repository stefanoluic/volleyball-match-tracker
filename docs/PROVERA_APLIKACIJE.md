# Provera aplikacije pre demonstracije

Ovo je spisak za ručnu proveru, ne evidencija da su koraci već izvršeni.
Automatski testovi ne proveravaju stvarni izgled stranice u pregledaču.

## Priprema

Pokreni aplikaciju preko `Pokreni.cmd`. Koristi probne timove i novu probnu
utakmicu, jer unosi ostaju u lokalnoj bazi. Nemoj brisati postojeće podatke
da bi proverio aplikaciju.

Potrebni su aktivni nalozi statističara i stručnog štaba. Za istovremeni rad
koristi dva različita pregledača ili običan i privatni prozor: obični tabovi
istog pregledača dele prijavljenu sesiju. Ne stavljaj lozinke u snimke ekrana.

## Tok provere

1. Registruj probni nalog. Pre odobrenja ne sme da se prijavi. Administrator
   može da ga odobri, blokira i tek nakon blokiranja trajno obriše.
2. Kao statističar napravi dva tima. Proveri obavezna polja i ponovljen broj
   dresa unutar istog tima. Kao stručni štab proveri da nema komandi za izmene.
3. Zakaži utakmicu, prijavi sastave i označi libera. Za demonstraciju izmena
   svakom timu obezbedi šest običnih igrača, bar jednu običnu rezervu i libera.
4. Izaberi šest različitih običnih igrača za početnu postavu i prvi servis.
   Libero ne sme da bude u početnoj šestorki. Pokreni utakmicu.
5. Dodaj poen timu koji servira, pa protivniku. Samo pri osvajanju servisa
   protivnik rotira. Proveri prikaz igrača koji sada servira.
6. Unesi nekoliko poena sa detaljima: napad, blok, as i grešku protivnika.
   Proveri da ponuđeni igrači odgovaraju akciji. Poništi poslednji poen:
   rezultat, servis, rotacija i statistika moraju da se vrate, a poništeni
   događaj da ostane označen u istoriji.
7. Izvrši običnu izmenu i povratak dozvoljenog igrača nakon poena. Proveri
   broj izmena. Ubaci libera umesto dozvoljenog igrača zadnje linije, odigraj
   poen pa ga vrati. Zamene libera ne smeju da troše obične izmene.
8. U drugom pregledaču, kao stručni štab, otvori istu utakmicu i statistiku.
   Novi poen i poništavanje treba da postanu vidljivi približno tri sekunde
   nakon prethodnog uspešnog učitavanja, bez ručnog osvežavanja.
9. Prebaci prikaz na završeni set. Pozadinsko osvežavanje ne sme da vrati
   izbor na aktuelni set. Uključi „Prati aktuelni set” da se vratiš na praćenje.
10. Završi set tek kada postoji potreban broj poena i dva razlike. Sledeći set
    počinje sa 0:0 i novim postavama. Prva četiri igraju se do najmanje 25,
    peti do najmanje 15; utakmica se završava trećim osvojenim setom.
11. Dok je u drugom pregledaču izabran raniji set, ostavi otvorenu statistiku
    cele utakmice i završi utakmicu kao statističar. Statistika i preporuke
    moraju da preuzmu konačne podatke, bez promene izabranog ranijeg seta.
    Nakon završetka nisu dozvoljeni novi poeni ni poništavanje zatvorenog seta.
12. Proveri stranicu na užoj širini, rad tastaturom, čitljivost poruka o grešci
    i povratak nakon odjave. Za prekid mreže koristi offline režim alata
    pregledača: automatski prikaz treba da pauzira, pa nastavi po povratku veze.

## Nesačuvani unosi i oporavak prikaza

- U probnoj zakazanoj utakmici promeni sastav ili delimično izaberi početne
  postave, pa pokušaj F5 ili zatvaranje taba. Ako pregledač prikaže upozorenje,
  izaberi ostanak na stranici: izbor treba da ostane nepromenjen.
- Nakon čuvanja ili izričitog odbacivanja izmena, stranica ne treba da upozorava
  zbog prethodnog izbora. I čist prikaz stručnog štaba treba da ostane bez upozorenja.
- Pregledač određuje izgled i dostupnost dijaloga; neki mobilni pregledači ga
  mogu potisnuti. Ovo nije automatsko čuvanje nacrta.
- Ako se pojavi ekran „Aplikacija nije mogla da se prikaže”, dugme za ponovno
  učitavanje je ručno: nema automatskog ponavljanja unosa. Posle učitavanja proveri
  podatke pre nego što ponovo pošalješ prethodni unos.

## Pretraga utakmica

- U tabu Utakmice unesi deo naziva domaćeg ili gostujućeg tima i pritisni
  „Primeni filtere”. Velika i mala slova ne treba da utiču na rezultat.
- Kombinuj naziv, status i period datuma. Oba datuma ulaze u period u vremenskoj
  zoni prikazanoj u aplikaciji; možeš navesti i samo početni ili krajnji datum.
  Krajnji datum pre početnog mora da prikaže grešku bez slanja pretrage.
- Ako postoji više stranica, pređi na drugu pa primeni filter. Prikaz mora da
  se vrati na prvu stranicu, a broj rezultata da odgovara filtriranoj listi.
  Promena stranice, osvežavanje i povratak iz utakmice moraju da zadrže filtere.
- Za nepostojeći naziv proveri poruku da nema rezultata za izabrane filtere.
  „Poništi filtere” treba da očisti polja i ponovo prikaže sve utakmice.
- Proveri forme i na uskom ekranu. Menjanje polja bez primene filtera ne treba
  odmah da menja listu; ispod forme tada stoji obaveštenje o neprimenjenom izboru.

## Statistika i preporuke

- Zbir kategorija tima mora da odgovara njegovom broju poena. Poeni greškom
  protivnika ne pripisuju se igraču kao osvojeni poeni.
- Uporedi jedan set sa celom utakmicom. Poništeni poeni ne ulaze u zbir.
- Preporuke se ne prikazuju pre deset važećih poena, niti kada više od 20%
  poena u izabranom opsegu nema detalje. Dovoljan uzorak ne garantuje preporuku:
  mora da bude ispunjeno i neko od pravila za izdvajanje obrasca.
- Proveri prikaz i kada nema podataka ili nema izdvojenih obrazaca. Preporuke
  su smernice za pregled igre, a ne automatska taktička odluka.

## Automatske provere

Iz direktorijuma `backend`: `mvn verify` uz pokrenut Docker. Integracioni
testovi koriste privremenu PostgreSQL bazu, ne razvojnu bazu. Povezani test
u `MatchStatisticsIntegrationTest` prolazi kroz 3:2, uključujući peti set
16:14, izmenu, libera, poništavanje, ponovljeni zahtev i konačnu statistiku.

Iz direktorijuma `frontend`: `npm test` i `npm run build`. Testovi komponenti
proveravaju i završno osvežavanje statistike, odbacivanje zakasnelog odgovora
i ručni oporavak nakon neuspelog završnog učitavanja.

PDF izveštaj i priprema za javno postavljanje nisu deo ove provere.
