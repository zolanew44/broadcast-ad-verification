// Synthetic demonstration data for public demo and testing
// Contains NO real company, broadcaster, staff, or commercial client information.

export const SAMPLE_SCHEDULE_FILENAME = 'Synthetic_Demo_Schedule_2026-10-13.txt';
export const SAMPLE_LOG_FILENAME = 'Synthetic_Demo_Automation_2026-10-13.log';

export const SYNTHETIC_SCHEDULE_TEXT = `Date\tShow\tTime\tPlacements\tRef\tAdvert\tSec\tStart Date\tEnd Date
Morning\tMorning News Digest\t06:00 - 06:05\tBeginning\tDEMO-1774\tAcme Electronics Spot\t45\tJul 07/2026\tOngoing
Morning\tMorning News Digest\t06:00 - 06:05\tBeginning\tDEMO-1838\tCity Fitness Promo\t60\tAug 14/2026\tOngoing
Morning\tMorning News Digest\t06:00 - 06:05\tBeginning\tDEMO-1853\tBeacon Healthcare\t30\tAug 20/2026\tOngoing
Morning\tMorning News Digest\t06:00 - 06:05\tBeginning\tDEMO-1907\tSummit Outdoor Gear\t30\tOct 06/2026\tOngoing
Morning\tMorning News Digest\t06:25 - 06:30\tEnding\tStation Break Transition
Morning\tMorning News Digest\t06:40 - 06:45\tMiddle\tSponsor Billboard\tAcme Corp, Nova Solar, Apex Retail
Morning\tMidday Bulletin\t11:40 - 11:45\tMiddle\tDEMO-1187-AD1\tApex Retail Autumn Sale\t60\tSep 10/2026\tOct 3/2026
Afternoon\tPrime Cinema Show\t14:00 - 14:05\tBeginning\tDEMO-1918\tNova Solar Power 30s\t30\tOct 08/2026\tOngoing
Afternoon\tPrime Cinema Show\t14:30 - 14:35\tMiddle\tDEMO-1000\tMetro Telecom 30s\t30\tSep 01/2026\tOngoing
Afternoon\tPrime Cinema Show\t15:15 - 15:20\tMiddle\tDEMO-1902\tBlue Horizon Insurance\t30\tOct 03/2026\tOngoing
Evening\tEvening News Hour\t19:15 - 19:20\tMiddle\tDEMO-1918\tNova Solar Power 30s\t30\tOct 08/2026\tOngoing
Evening\tEvening News Hour\t19:45 - 19:50\tEnding\tDEMO-2020\tFuture Launch Campaign\t30\tOct 25/2026\tNov 15/2026
`;

export const SYNTHETIC_LOG_TEXT = `13-10-2026 06:00:00\t00000101\tTRAN 001 - Station Ident\t00:00:15
13-10-2026 06:00:15\t00000102\tDEMO-1774  Acme Electronics Spot\t00:00:45
13-10-2026 06:01:00\t00000103\tDEMO-1838  City Fitness Promo\t00:01:00
13-10-2026 06:02:00\t00000104\tDEMO-1853  Beacon Healthcare\t00:00:30
13-10-2026 06:02:30\t00000105\tDEMO-1907  Summit Outdoor Gear\t00:00:30
13-10-2026 06:03:00\t00000106\tMETRO FILM TRANSTION #1\t00:00:10
13-10-2026 14:00:30\t00000201\tDEMO-1918  Nova Solar Power 30s\t00:00:30
13-10-2026 14:30:15\t00000202\tDEMO-1000  Metro Telecom 30s\t00:00:30
13-10-2026 14:30:45\t00000203\tDEMO-1000  Metro Telecom 30s\t00:00:30
13-10-2026 15:15:30\t00000204\tDEMO-1902  Blue Horizon Insurance\t00:01:00
13-10-2026 16:00:00\t00000301\tDEMO-2005  Starlight Beverages Unscheduled\t00:00:30
`;

/**
 * Returns an ArrayBuffer of the synthetic schedule in standard UTF-8
 */
export function getSampleScheduleBuffer(): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(SYNTHETIC_SCHEDULE_TEXT).buffer;
}

/**
 * Returns an ArrayBuffer of the synthetic playout log in UTF-16LE without BOM
 * (simulates a standard broadcast automation server output)
 */
export function getSampleLogBuffer(): ArrayBuffer {
  const charCodes = new Uint16Array(SYNTHETIC_LOG_TEXT.length);
  for (let i = 0; i < SYNTHETIC_LOG_TEXT.length; i++) {
    charCodes[i] = SYNTHETIC_LOG_TEXT.charCodeAt(i);
  }
  return charCodes.buffer;
}
