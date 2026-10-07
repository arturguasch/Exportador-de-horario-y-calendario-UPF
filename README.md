# Exportador d'horari i calendari UPF, versió 1.1.6

Extensió per a Chrome i Edge que exporta l’horari de classes de la UPF des de la Secretaria Virtual o gestió acadèmica a fitxers `.ics` compatibles amb Google Calendar, Apple Calendar, Outlook i altres calendaris, o el sincronitza directament amb Google Calendar.

## Instal·lació senzilla

Afegeix l’extensió automàticament des de la Chrome Web Store:
https://chromewebstore.google.com/detail/ijndcdclgmgbmdmcppklikbmdgbapaig?utm_source=item-share-cb

## Instal·lació manual

1. Descomprimeix el ZIP en una carpeta fixa.
2. Obre `chrome://extensions` o `edge://extensions`.
3. Activa el `Mode de desenvolupador`.
4. Prem `Carrega descomprimida`.
5. Selecciona la carpeta descomprimida.

## Ús recomanat dels colors a Google Calendar

### Mode automàtic (recomanat)

Al mode automàtic pots crear un sol calendari o **un calendari per matèria**, amb nom i **color de la barra lateral** a Google Calendar. Al pas de matèries tries el color de cada classe i, si vols, un color propi per a seminaris o exàmens.

Així el color del calendari (barra lateral) i el color de cada esdeveniment es configuren des de l’extensió i es mantenen en sincronitzar.

### Mode manual (`.ics`)

Google Calendar no respecta de forma fiable els colors per esdeveniment en importar fitxers `.ics`.

Si exportes en manual i vols colors diferenciats:

1. Crea un calendari diferent per a cada matèria a Google Calendar.
2. Assigna un color a cada calendari.
3. A l’extensió, activa `Crear un .ics per a cada matèria seleccionada`.
4. Importa cada `.ics` al calendari corresponent.

## Canvis a la versió 1.1.6

- A cada matèria detectada es pot editar el nom (per defecte el nom original de l’horari).
- Selector de dates actualitzat: es pot escriure a mà i obrir un calendari propi (desplegable centrat amb fons enfosquit).
- Opció de notificació uns minuts abans de cada classe al mode Google Calendar.
- Els apartats de format (**Classes de teoria**, **Seminaris** i **Exàmens**) només es poden configurar si, a les matèries seleccionades, hi ha esdeveniments d’aquell tipus; si no n’hi ha, es mostra un avís i no cal configurar-los.
- Bug fix: amb **un calendari per matèria**, el color de la barra lateral ja no pinta tots els esdeveniments; es respecten el color principal i els de seminaris/exàmens.
- Bug fix: si es detecta sense matèries i es torna a obrir l’extensió, ja no reapareixen matèries d’una detecció anterior.

## Canvis a la versió 1.1.5 (hotfix)

- Les matèries detectades només es mostren si obres l’extensió estant a l’horari de la Secretaria Virtual o gestió acadèmica; en qualsevol altra pàgina cal tornar a l’horari i prémer «Detectar matèries».
- En tornar a detectar, es conserven colors, noms de calendari i altres preferències ja configurades per a matèries que coincideixin.
- En reiniciar l’extensió des de Configuració, s’esborra també l’estat de sessió (abans les matèries podien reaparèixer sense haver detectat).
- Hotfix: sincronització amb Google Calendar — els colors d’esdeveniment reutilitzen les etiquetes que Google ja té al calendari (abans molts esdeveniments fallaven amb «Invalid event label id»).
- Hotfix: si un color encara no es pot aplicar, l’esdeveniment es sincronitza sense color en lloc de fallar.
- Enllaç del tutorial actualitzat: https://youtu.be/tbHzqdp6fEU

## Canvis a la versió 1.1.4

- Al mode automàtic, el nom del calendari passa al pas 4 (després de detectar matèries).
- Opció d’**un sol calendari** (per defecte) o **un calendari per matèria**.
- Amb un calendari per matèria es pot editar el nom i el color lateral de cada calendari.
- Selector de color renovat: paleta de Google, barra de colors desats, selector personalitzat (to i saturació), pipeta, camp HEX i previsualització.
- El selector s’obre centrat amb fons enfosquit; correccions en negre, blanc i colors sense saturació.
- Pas 4 reanomenat a **Nom i color lateral del calendari**, amb text que explica que el color és el de la **barra lateral** de Google Calendar.
- Enllaç «Algun dubte? / Veure el tutorial» al vídeo d’ajuda: https://youtu.be/tbHzqdp6fEU

## Canvis a la versió 1.1.3

- Si una assignatura té diversos grups de seminaris (p. ex. 301, 302, 303), apareix un avís ⚠️ al costat del desplegable.
- Dins del desplegable es poden triar quins grups exportar o sincronitzar (Tots / Cap / xips per grup).
- En passar el ratolí per l’avís s’explica que s’han detectat diversos grups; en fer-hi clic se’n descarta l’avís.
- En tornar a prémer «Detectar matèries», la selecció de grups es reinicia a tots (evita quedar-se només amb un grup anterior).
- El color opcional de seminaris/exàmens s’aclareix: sempre s’inclouen; «Color propi» només canvia el color.
- Després de sincronitzar o exportar, els números i detalls queden en un desplegable «Detalls tècnics» (tancat per defecte).
- Si se suprimeix el calendari a Google Calendar, l’extensió detecta que ja no existeix, en crea un de nou i no falla amb errors 410 d’esdeveniments esborrats.
- La llista de matèries creix amb el contingut (sense barra de desplaçament interna fixa).

## Canvis a la versió 1.1.2

- Hotfix: es corregeix la codificació UTF-8 en textos de format (accents i icona ⚙ d’ajustaments de blocs).
- Hotfix: es restaura la fletxa ▾ del desplegable de color i de les matèries.
- Hotfix: l’engranatge d’opcions de format torna a obrir-se (mateix problema de `resize` del popup).

## Canvis a la versió 1.1.1

- Hotfix: el selector de color per matèria es tancava a l’instant en obrir-se (el popup disparava `resize` i buidava la paleta).
- Es manté la paleta flotant original de la 1.1.0.

## Canvis a la versió 1.1.0

- S’actualitza la versió del paquet de `1.0.4` a `1.1.0`.
- El **mode automàtic** (Google Calendar) passa a ser el mode principal: apareix a l’esquerra i és el predeterminat.
- S’elimina l’avís que el mode automàtic està en proves.
- Barra de progrés durant la sincronització (`X/Y`, creats / actualitzats / fallits).
- Missatges d’estat clars: en curs (groc), èxit (verd), avisos o error (groc / vermell), amb opció de contacte per correu si alguna cosa falla.
- Llista d’esdeveniments fallits després de la sincronització.
- Si ja existeix un calendari amb el mateix nom, l’extensió pregunta dins del panell de progrés si es volen esborrar els esdeveniments previs o conservar-los i sincronitzar.
- Botó d’emergència per aturar la sincronització.
- Format de títols amb apartats **Classes de teoria**, **Seminaris** i **Exàmens**.
- Cada bloc de format pot usar el separador `|` (actiu per defecte només a Aula; si dos blocs veïns el tenen, només n’apareix un `|`).
- Enllaç fix per donar suport al manteniment del projecte: https://buymeacoffee.com/openextensions
- Botó **Reportar un error** a Configuració.
- Política de privacitat actualitzada a `https://upfcalendarexporter.es/#privacidad`.
- Ajustos d’UI: desplaçament més net; l’idioma i el mode fosc es desen a l’instant (sense botó «Desar» redundant).
- Durant la sincronització amb Google cal mantenir el popup obert fins que acabi.

## Canvis a la versió 1.0.4

- S’actualitza la versió del paquet de `1.0.3` a `1.0.4`.
- S’afegeixen dos modes d’exportació: **mode manual** (`.ics`) i **mode automàtic** (sincronització amb Google Calendar).
- El mode automàtic es mostra com a funcionalitat **en proves**; pot no funcionar correctament per a tots els usuaris mentre es completa la configuració de Google OAuth.
- Nova interfície per passos per exportar o sincronitzar l’horari.
- Personalització del format dels títols d’esdeveniments (teoria, seminaris i exàmens) amb blocs, prefixos, sufixos i text propi.
- Detecció de matèries, selecció per assignatura i assignació de colors al mode automàtic.
- S’afegeixen els permisos `identity` i `tabs`, i accés a `googleapis.com` i `accounts.google.com` per a la sincronització amb Google Calendar.
- Millores a la zona horària `Europe/Madrid` per a l’exportació `.ics`.
- Avís visible en groc al mode automàtic indicant que la sincronització està en proves.
- Actualització de la política de privacitat per reflectir l’ús opcional de Google Calendar.

## Canvis a la versió 1.0.3

- S’actualitza la versió del paquet de `1.0.2` a `1.0.3`.
- Es canvia el nom a `Exportador d'horari i calendari UPF` i es millora la descripció per a SEO.
- S’actualitza l’enllaç públic de gestió acadèmica per obrir directament amb entrada pública i idioma català.
- S’elimina el permís `tabs`; l’extensió manté `activeTab`, `scripting`, `downloads` i `storage`.
- S’afegeix suport per a `https://gestioacademica.upf.edu/*`, a més de `https://secretariavirtual.upf.edu/*`.
- L’avís inicial apareix en vermell quan la pestanya actual no és una pàgina compatible de la UPF.
- L’avís de pàgina no compatible inclou enllaços a la secretaria virtual de la UPF i a l’horari públic de gestió acadèmica.
- El primer pas d’ajuda permet entrar des de la secretaria virtual de la UPF o des de gestió acadèmica.
- El subtítol es generalitza a qualsevol calendari compatible, no només Google Calendar.
- S’eliminen els camps visibles de nom del calendari i del fitxer; ara s’usen noms per defecte segons l’idioma.
- Els seminaris mostren el grup amb prefix `G:` al títol de l’esdeveniment, per exemple `G: 102`.
- S’afegeix mode fosc configurable des del panell de configuració; per defecte segueix el tema del navegador o del sistema.
- Es corregeix el botó `Cap` / `Ninguna` / `None` per poder deixar totes les matèries desmarcades.
- S’afegeix la versió de l’extensió dins del panell de configuració.
- Es millora la compatibilitat dels fitxers `.ics` incloent-hi la zona horària `Europe/Madrid` amb `VTIMEZONE`.
- Les etiquetes de la descripció de l’esdeveniment es tradueixen segons l’idioma seleccionat.
- S’evita descarregar fitxers `.ics` buits quan no hi ha esdeveniments exportables.
- Els missatges d’error de l’àrea d’estat es mostren en una caixa vermella i tornen a l’estil normal quan desapareix l’error.
- Es netegen claus de traducció no utilitzades.

## Privacitat

Extensió no oficial. No està afiliada, avalada ni mantinguda per la Universitat Pompeu Fabra.

L’extensió processa les dades localment al navegador. No recopila, ven ni transmet dades personals a servidors propis. La sincronització amb Google Calendar només es fa si l’usuari connecta el seu compte i prem sincronitzar; en aquest cas, els esdeveniments seleccionats s’envien al compte de Google de l’usuari.

Política de privacitat: https://upfcalendarexporter.es/#privacidad

Suport al projecte: https://buymeacoffee.com/openextensions
