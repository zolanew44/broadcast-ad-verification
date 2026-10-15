import { ComparisonResult, AdDiscrepancyItem } from '@/types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Builds the multi-sheet Excel workbook in-memory.
 */
export function buildComparisonWorkbook(
  result: ComparisonResult,
  filteredItems?: AdDiscrepancyItem[]
): XLSX.WorkBook {
  const { summary, items } = result;
  const itemsToExport = filteredItems && filteredItems.length > 0 ? filteredItems : items;

  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const summaryData = [
    ['BROADCAST ADVERTISING VERIFICATION REPORT'],
    ['Generated On', summary.generatedAt],
    ['Broadcast Date', summary.broadcastDate],
    ['Schedule File', summary.scheduleFileName],
    ['Actual Log File', summary.logFileName],
    ['Compliance Rate', `${summary.complianceRate}%`],
    [],
    ['KEY PERFORMANCE INDICATORS', 'COUNT', 'STATUS / ACTION'],
    ['Total Eligible Scheduled Placements', summary.eligiblePlacements, 'Base commercial commitments'],
    ['Matched Placements (Verified)', summary.matchedPlacements, 'Aired as scheduled'],
    ['Potentially Missing Placements', summary.potentiallyMissingPlacements, 'Immediate make-good required'],
    ['Extra Airings', summary.extraAirings, 'Unscheduled or bonus airings'],
    ['Possible Duplicates', summary.possibleDuplicates, 'Double-play or rapid repeat'],
    ['Expired Campaign Placements', summary.expiredCampaignPlacements, 'Schedule clean-up required'],
    ['Outside Campaign Dates', summary.outsideCampaignPlacements, 'Premature airings'],
    ['Records Requiring Manual Review', summary.needsManualReview, 'Human operator inspection'],
    ['Parsing / Format Warnings', summary.parsingWarnings, 'Station transitions / billboards'],
    [],
    ['SUMMARY OF ALL RESULTS IN CURRENT VIEW', itemsToExport.length, 'Records in current report export'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // Helper to format table rows
  const formatRows = (itemList: AdDiscrepancyItem[]) =>
    itemList.map((item, idx) => ({
      '#': idx + 1,
      'Status': item.status.replace(/_/g, ' '),
      'Match Tier': item.matchTier ? item.matchTier.replace(/_/g, ' ') : 'N/A',
      'Reference Code': item.ref,
      'Advertiser / Title': item.advertName,
      'Program / Show': item.program,
      'Scheduled Slot': item.scheduledTime,
      'Actual Airing Time': item.actualAiringTime,
      'Expected': item.expectedCount,
      'Actual': item.actualCount,
      'Duration': item.duration,
      'Campaign Start': item.campaignStartDate,
      'Campaign End': item.campaignEndDate,
      'Explanation': item.explanation,
      'Recommended Follow-up': item.recommendedFollowUp,
      'Manually Corrected': item.isManuallyCorrected ? 'Yes' : 'No',
      'Correction Note': item.manualCorrectionNote || '',
      'Reviewed': item.isReviewed ? 'Yes' : 'No',
      'Review Note': item.reviewNote || '',
    }));

  // 2. All Items (or current filter)
  const wsDetailed = XLSX.utils.json_to_sheet(formatRows(itemsToExport));
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'Detailed Results');

  // 3. Potentially Missing Placements
  const missingItems = items.filter(i => i.status === 'POTENTIALLY_MISSING');
  if (missingItems.length > 0) {
    const wsMissing = XLSX.utils.json_to_sheet(formatRows(missingItems));
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing Placements');
  }

  // 4. Matched Placements
  const matchedItems = items.filter(i => i.status === 'MATCHED');
  if (matchedItems.length > 0) {
    const wsMatched = XLSX.utils.json_to_sheet(formatRows(matchedItems));
    XLSX.utils.book_append_sheet(wb, wsMatched, 'Matched Airings');
  }

  // 5. Extra Airings & Duplicates
  const extraItems = items.filter(i => i.status === 'EXTRA_AIRING' || i.status === 'POSSIBLE_DUPLICATE');
  if (extraItems.length > 0) {
    const wsExtra = XLSX.utils.json_to_sheet(formatRows(extraItems));
    XLSX.utils.book_append_sheet(wb, wsExtra, 'Extra & Duplicates');
  }

  // 6. Expired Campaigns
  const expiredItems = items.filter(i => i.status === 'EXPIRED_CAMPAIGN' || i.status === 'OUTSIDE_CAMPAIGN');
  if (expiredItems.length > 0) {
    const wsExpired = XLSX.utils.json_to_sheet(formatRows(expiredItems));
    XLSX.utils.book_append_sheet(wb, wsExpired, 'Campaign Date Issues');
  }

  // 7. Manual Review
  const reviewItems = items.filter(i => i.status === 'NEEDS_MANUAL_REVIEW');
  if (reviewItems.length > 0) {
    const wsReview = XLSX.utils.json_to_sheet(formatRows(reviewItems));
    XLSX.utils.book_append_sheet(wb, wsReview, 'Manual Review');
  }

  return wb;
}

/**
 * Generates and downloads a multi-sheet Excel workbook.
 */
export function exportComparisonToExcel(
  result: ComparisonResult,
  filteredItems?: AdDiscrepancyItem[],
  customFilename?: string
): void {
  const wb = buildComparisonWorkbook(result, filteredItems);
  const filename = customFilename || `Broadcast_Ad_Verification_${result.summary.broadcastDate || 'Report'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Builds the PDF document object in-memory.
 */
export function buildComparisonPDF(
  result: ComparisonResult,
  filteredItems?: AdDiscrepancyItem[]
): jsPDF {
  const { summary, items } = result;
  const itemsToExport = filteredItems && filteredItems.length > 0 ? filteredItems : items;

  // Use landscape A4 for rich tabular readability
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top header banner
  doc.setFillColor(12, 64, 110); // Navy blue
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BROADCAST ADVERTISING VERIFICATION REPORT', 30, 28);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Broadcast Date: ${summary.broadcastDate}   |   Compliance: ${summary.complianceRate}%   |   Generated: ${new Date().toLocaleString()}`,
    30,
    44
  );

  // File context
  doc.setTextColor(50, 60, 70);
  doc.setFontSize(8);
  doc.text(`Schedule File: ${summary.scheduleFileName}   |   Actual Log File: ${summary.logFileName}`, 30, 70);

  // Summary KPI Cards (Horizontal layout)
  const kpis = [
    { label: 'Eligible Placements', val: summary.eligiblePlacements, color: [240, 244, 248] },
    { label: 'Matched (Verified)', val: summary.matchedPlacements, color: [230, 248, 235] },
    { label: 'Potentially Missing', val: summary.potentiallyMissingPlacements, color: [254, 235, 235] },
    { label: 'Extra Airings', val: summary.extraAirings, color: [254, 244, 230] },
    { label: 'Expired Campaigns', val: summary.expiredCampaignPlacements, color: [243, 232, 255] },
    { label: 'Needs Review', val: summary.needsManualReview, color: [255, 251, 235] },
  ];

  const cardWidth = (pageWidth - 60 - (kpis.length - 1) * 8) / kpis.length;
  let currentX = 30;
  const cardY = 80;
  const cardH = 38;

  kpis.forEach(kpi => {
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.roundedRect(currentX, cardY, cardWidth, cardH, 3, 3, 'F');
    doc.setDrawColor(200, 210, 220);
    doc.roundedRect(currentX, cardY, cardWidth, cardH, 3, 3, 'S');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 30, 40);
    doc.text(String(kpi.val), currentX + 8, cardY + 18);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 90, 100);
    doc.text(kpi.label, currentX + 8, cardY + 31);

    currentX += cardWidth + 8;
  });

  // Table Data
  const tableRows = itemsToExport.map((item, idx) => {
    let statusText = item.status.replace(/_/g, ' ');
    if (item.isManuallyCorrected) {
      statusText += '\n[Corrected]';
    } else if (item.matchTier && item.matchTier !== 'UNMATCHED') {
      const tierShort = item.matchTier === 'EXACT_REF' ? 'Exact' : item.matchTier === 'CONSTRAINED_NORM_REF' ? 'Norm' : 'Title';
      statusText += `\n(${tierShort})`;
    }

    let reviewText = item.isReviewed ? `Yes: ${item.reviewNote || 'OK'}` : 'Unreviewed';
    if (item.isManuallyCorrected) {
      reviewText += item.manualCorrectionNote ? `\n(Corr: ${item.manualCorrectionNote.slice(0, 30)})` : '\n(Manual Corr)';
    }

    return [
      String(idx + 1),
      statusText,
      item.ref,
      item.advertName.length > 25 ? item.advertName.slice(0, 25) + '...' : item.advertName,
      item.program.length > 20 ? item.program.slice(0, 20) + '...' : item.program,
      item.scheduledTime,
      item.actualAiringTime,
      `${item.expectedCount} / ${item.actualCount}`,
      item.duration,
      item.explanation.length > 45 ? item.explanation.slice(0, 45) + '...' : item.explanation,
      item.recommendedFollowUp.length > 40 ? item.recommendedFollowUp.slice(0, 40) + '...' : item.recommendedFollowUp,
      reviewText,
    ];
  });

  autoTable(doc, {
    startY: 130,
    margin: { left: 25, right: 25 },
    head: [[
      '#',
      'Status',
      'Ref Code',
      'Advertiser / Title',
      'Program',
      'Scheduled',
      'Actual Airing',
      'Exp/Act',
      'Dur',
      'Explanation',
      'Recommended Action',
      'Review Status',
    ]],
    body: tableRows,
    theme: 'striped',
    styles: {
      fontSize: 7,
      cellPadding: 3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [12, 64, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center' },
      1: { fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
      7: { halign: 'center' },
    },
    didDrawPage: () => {
      const str = `Page ${doc.getNumberOfPages()}  |  Broadcast Ad Verification System  |  Confidential Managerial Audit`;
      doc.setFontSize(7.5);
      doc.setTextColor(130, 140, 150);
      doc.text(str, pageWidth / 2, pageHeight - 15, { align: 'center' });
    },
  });

  return doc;
}

/**
 * Generates and downloads a clean, professional, print-ready PDF audit report.
 */
export function exportComparisonToPDF(
  result: ComparisonResult,
  filteredItems?: AdDiscrepancyItem[],
  customFilename?: string
): void {
  const doc = buildComparisonPDF(result, filteredItems);
  const filename = customFilename || `Broadcast_Ad_Verification_${result.summary.broadcastDate || 'Report'}.pdf`;
  doc.save(filename);
}
