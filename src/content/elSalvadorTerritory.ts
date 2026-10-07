// Division politico-administrativa de El Salvador vigente desde mayo 2024
// (reforma territorial): 14 departamentos, 44 municipios, 262 distritos.
// Fuente: Wikipedia "Anexo:Municipios y distritos de El Salvador" (es), basada en
// el decreto de reorganizacion territorial (Asamblea Legislativa, 2023).
// Los antiguos municipios son hoy los distritos. Si el cliente detecta un nombre
// incorrecto, se corrige aqui (unico punto). Conteos 14/44/262 probados en
// elSalvadorTerritory.test.ts.
// Formato compacto: "Departamento|Municipio|distrito;distrito;..."
const RAW: readonly string[] = [
  'Ahuachapán|Ahuachapán Norte|Atiquizaya;El Refugio;San Lorenzo;Turín',
  'Ahuachapán|Ahuachapán Centro|Ahuachapán;Apaneca;Concepción de Ataco;Tacuba',
  'Ahuachapán|Ahuachapán Sur|Guaymango;Jujutla;San Francisco Menéndez;San Pedro Puxtla',
  'Cabañas|Cabañas Este|Guacotecti;San Isidro;Sensuntepeque;Victoria;Dolores',
  'Cabañas|Cabañas Oeste|Cinquera;Ilobasco;Jutiapa;Tejutepeque',
  'Chalatenango|Chalatenango Norte|Citalá;La Palma;San Ignacio',
  'Chalatenango|Chalatenango Centro|Agua Caliente;Dulce Nombre de María;El Paraíso;La Reina;Nueva Concepción;San Fernando;San Francisco Morazán;San Rafael;Santa Rita;Tejutla',
  'Chalatenango|Chalatenango Sur|Arcatao;Azacualpa;San José Cancasque;Chalatenango;Comalapa;Concepción Quezaltepeque;El Carrizal;La Laguna;Las Vueltas;San José Las Flores;Nombre de Jesús;Nueva Trinidad;Ojos de Agua;Potónico;San Antonio de la Cruz;San Antonio Los Ranchos;San Francisco Lempa;San Isidro Labrador;San Luis del Carmen;San Miguel de Mercedes',
  'Cuscatlán|Cuscatlán Norte|Suchitoto;San José Guayabal;Oratorio de Concepción;San Bartolomé Perulapía;San Pedro Perulapán',
  'Cuscatlán|Cuscatlán Sur|Cojutepeque;Candelaria;El Carmen;El Rosario;Monte San Juan;San Cristóbal;San Rafael Cedros;San Ramón;Santa Cruz Analquito;Santa Cruz Michapa;Tenancingo',
  'La Libertad|La Libertad Norte|Quezaltepeque;San Matías;San Pablo Tacachico',
  'La Libertad|La Libertad Centro|San Juan Opico;Ciudad Arce',
  'La Libertad|La Libertad Oeste|Colón;Jayaque;Sacacoyo;Tepecoyo;Talnique',
  'La Libertad|La Libertad Este|Antiguo Cuscatlán;Huizúcar;Nuevo Cuscatlán;San José Villanueva;Zaragoza',
  'La Libertad|La Libertad Costa|Chiltiupán;Jicalapa;La Libertad;Tamanique;Teotepeque',
  'La Libertad|La Libertad Sur|Santa Tecla;Comasagua',
  'La Paz|La Paz Oeste|Cuyultitán;Olocuilta;San Juan Talpa;San Luis Talpa;San Pedro Masahuat;Tapalhuaca;San Francisco Chinameca',
  'La Paz|La Paz Centro|El Rosario;Jerusalén;Mercedes La Ceiba;Paraíso de Osorio;San Antonio Masahuat;San Emigdio;San Juan Tepezontes;San Luis La Herradura;San Miguel Tepezontes;San Pedro Nonualco;Santa María Ostuma;Santiago Nonualco',
  'La Paz|La Paz Este|San Juan Nonualco;San Rafael Obrajuelo;Zacatecoluca',
  'La Unión|La Unión Norte|Anamorós;Bolívar;Concepción de Oriente;El Sauce;Lislique;Nueva Esparta;Pasaquina;Polorós;San José La Fuente;Santa Rosa de Lima',
  'La Unión|La Unión Sur|Conchagua;El Carmen;Intipucá;La Unión;Meanguera del Golfo;San Alejo;Yayantique;Yucuaiquín',
  'Morazán|Morazán Norte|Arambala;Cacaopera;Corinto;El Rosario;Joateca;Jocoaitique;Meanguera;Perquín;San Fernando;San Isidro;Torola',
  'Morazán|Morazán Sur|Chilanga;Delicias de Concepción;El Divisadero;Gualococti;Guatajiagua;Jocoro;Lolotiquillo;Osicala;San Carlos;San Francisco Gotera;San Simón;Sensembra;Sociedad;Yamabal;Yoloaiquín',
  'San Miguel|San Miguel Norte|Ciudad Barrios;Sesori;Nuevo Edén de San Juan;San Gerardo;San Luis de la Reina;Carolina;San Antonio del Mosco;Chapeltique',
  'San Miguel|San Miguel Centro|San Miguel;Comacarán;Uluazapa;Moncagua;Quelepa;Chirilagua',
  'San Miguel|San Miguel Oeste|Chinameca;El Tránsito;Lolotique;Nueva Guadalupe;San Jorge;San Rafael Oriente',
  'San Salvador|San Salvador Norte|Aguilares;El Paisnal;Guazapa',
  'San Salvador|San Salvador Oeste|Apopa;Nejapa',
  'San Salvador|San Salvador Este|Ilopango;San Martín;Soyapango;Tonacatepeque',
  'San Salvador|San Salvador Centro|Ayutuxtepeque;Mejicanos;Cuscatancingo;Ciudad Delgado;San Salvador',
  'San Salvador|San Salvador Sur|San Marcos;Santo Tomás;Santiago Texacuangos;Panchimalco;Rosario de Mora',
  'San Vicente|San Vicente Norte|Apastepeque;Santa Clara;San Ildefonso;San Esteban Catarina;San Sebastián;San Lorenzo;Santo Domingo',
  'San Vicente|San Vicente Sur|San Vicente;Guadalupe;San Cayetano Istepeque;Tecoluca;Tepetitán;Verapaz',
  'Santa Ana|Santa Ana Norte|Masahuat;Metapán;Santa Rosa Guachipilín;Texistepeque',
  'Santa Ana|Santa Ana Centro|Santa Ana',
  'Santa Ana|Santa Ana Este|Coatepeque;El Congo',
  'Santa Ana|Santa Ana Oeste|Candelaria de la Frontera;Chalchuapa;El Porvenir;San Antonio Pajonal;San Sebastián Salitrillo;Santiago de la Frontera',
  'Sonsonate|Sonsonate Norte|Juayúa;Nahuizalco;Salcoatitán;Santa Catarina Masahuat',
  'Sonsonate|Sonsonate Centro|Sonsonate;Sonzacate;Nahulingo;San Antonio del Monte;Santo Domingo de Guzmán',
  'Sonsonate|Sonsonate Este|Armenia;Caluco;Cuisnahuat;Izalco;San Julián;Santa Isabel Ishuatán',
  'Sonsonate|Sonsonate Oeste|Acajutla',
  'Usulután|Usulután Norte|Alegría;Berlín;El Triunfo;Estanzuelas;Jucuapa;Mercedes Umaña;Nueva Granada;San Buenaventura;Santiago de María',
  'Usulután|Usulután Este|California;Concepción Batres;Ereguayquín;Jucuarán;Ozatlán;Santa Elena;San Dionisio;Santa María;Tecapán;Usulután',
  'Usulután|Usulután Oeste|Jiquilisco;Puerto El Triunfo;San Agustín;San Francisco Javier',
];

export interface Distrito {
  /** Id estable: `${municipioId}/${slug}` */
  id: string;
  name: string;
}
export interface Municipio {
  id: string;
  name: string;
  distritos: readonly Distrito[];
}
export interface Departamento {
  id: string;
  name: string;
  municipios: readonly Municipio[];
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function build(): readonly Departamento[] {
  const deps: { id: string; name: string; municipios: Municipio[] }[] = [];
  for (const line of RAW) {
    const [depName = '', munName = '', distritos = ''] = line.split('|');
    let dep = deps.find((d) => d.name === depName);
    if (!dep) {
      dep = { id: slug(depName), name: depName, municipios: [] };
      deps.push(dep);
    }
    const munId = `${dep.id}/${slug(munName)}`;
    dep.municipios.push({
      id: munId,
      name: munName,
      distritos: distritos.split(';').map((n) => ({ id: `${munId}/${slug(n)}`, name: n })),
    });
  }
  return deps;
}

export const DEPARTAMENTOS: readonly Departamento[] = build();

export function getDepartamento(id: string): Departamento | undefined {
  return DEPARTAMENTOS.find((d) => d.id === id);
}
export function getMunicipio(depId: string, munId: string): Municipio | undefined {
  return getDepartamento(depId)?.municipios.find((m) => m.id === munId);
}
export function getDistrito(depId: string, munId: string, distId: string): Distrito | undefined {
  return getMunicipio(depId, munId)?.distritos.find((d) => d.id === distId);
}
