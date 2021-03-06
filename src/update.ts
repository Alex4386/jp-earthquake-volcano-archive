import { loadEarthquakesFile, saveEarthquakesFile, loadVolcanoesFile, saveVolcanoesFile } from './common/fileSystem';
import { EarthquakeData, EarthquakeCache, getEarthquakes } from './Earthquake';
import {
  VolcanoModel,
  loadVolcanoesDataByArea,
  AreaIdentifier,
  getVolcanoMetadata,
  getVolcanoStatus,
  getMapsLastUpdate,
  VolcanoStatus,
} from './Volcanoes';

export const updateFile = './data/updates.json';

export interface UpdateModel {
  volcanoes: VolcanoModel[];
  earthquakes: EarthquakeData[];
  lastUpdate: Date;
  reportFile?: string;
}

export async function updateEarthquakes(): Promise<EarthquakeData[]> {
  const updates = [];

  let cache: EarthquakeCache | null;
  cache = loadEarthquakesFile();

  if (cache !== null) {
    const updatesTmp = await getEarthquakes(cache);
    if (updatesTmp !== null) {
      updates.push(...updatesTmp);
    }
  } else {
    cache = {
      lastUpdate: new Date(),
      data: (await getEarthquakes()) as EarthquakeData[],
    };
    updates.push(...cache.data);
  }

  saveEarthquakesFile(cache);
  return updates;
}

export async function updateVolcanoes(updateMetadata?: boolean): Promise<VolcanoModel[]> {
  const cache = loadVolcanoesFile();
  const volcanoes: VolcanoModel[] = [];

  const updated: VolcanoModel[] = [];

  if (cache !== null) {
    volcanoes.push(...cache);
  } else {
    const volcanoesURL = await loadVolcanoesDataByArea(AreaIdentifier.GLOBAL);

    for (const volcanoURL of volcanoesURL) {
      const volcano = await getVolcanoMetadata(volcanoURL);
      if (volcano === null) continue;
      volcanoes.push(volcano);
      volcano?.craters.length == 0
        ? console.log(
            '[Volca] Error while processing volcano ' + volcano.name + ' at ' + volcano.region + '#' + volcano.id,
          )
        : console.log('[Volca] Processed volcano ' + volcano?.name + '!');
    }
  }

  const alerts = await getVolcanoStatus(-1);

  for (const volcano of volcanoes) {
    if (updateMetadata) {
      const data = await getVolcanoMetadata(
        {
          area: volcano.area,
          url: volcano.metadata.page,
        },
        volcano,
      );

      if (data !== null) {
        updated.push(volcano);
      }
    }
  }

  for (const alert of alerts) {
    const issuedTo = alert.issuedTo;

    let volcanoIdx = volcanoes.map((n) => n.name === issuedTo).indexOf(true);
    if (volcanoIdx < 0) {
      volcanoIdx = volcanoes.map((n) => issuedTo.includes(n.name)).indexOf(true);

      if (volcanoIdx < 0) {
        continue;
      }
    }

    const volcano = volcanoes[volcanoIdx];
    if (volcano.alerts === undefined) {
      volcano.alerts = {
        data: [],
        lastUpdate: await getMapsLastUpdate(volcano.area),
      };
    }

    const latestAlert = volcano.alerts.data
      .filter((a) => a.issuedTo === alert.issuedTo)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];
    const duplicateFound = latestAlert !== undefined && volcanoAlertIsDuplicateWithoutIssuedAt(latestAlert, alert);

    if (!duplicateFound) {
      updated.push(volcano);
      volcano.alerts.data.push(alert);
    }
  }

  saveVolcanoesFile(volcanoes);
  return updated;
}

function volcanoAlertIsDuplicateWithoutIssuedAt(a: VolcanoStatus, b: VolcanoStatus) {
  const aTmp = {
    issuedTo: a.issuedTo,
    data: a.data,
  };
  const bTmp = {
    issuedTo: b.issuedTo,
    data: b.data,
  };

  return JSON.stringify(aTmp) === JSON.stringify(bTmp);
}
