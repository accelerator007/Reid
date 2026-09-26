// A table of numbers in a report is data; a chart is the answer. These helpers
// find the one series a table is really about and draw it, so a revenue or
// attendance report carries its own shape instead of making the reader add up
// columns in their head.
const arabicDigits = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', '٬': '' };

export function parseNumber(value) {
  const text = String(value ?? '').trim().replace(/[٠-٩٫٬]/g, match => arabicDigits[match] ?? match);
  // A cell is a number only if the digits are the whole point of it: an amount
  // with a currency or percent sign counts, a sentence containing a year does not.
  const match = /^[^\d\-+]{0,6}?([-+]?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|[-+]?\d+(?:\.\d+)?)\s*([^\d]{0,8})$/.exec(text);
  if (!match) return null;
  const number = Number(match[1].replace(/[,\s]/g, ''));
  return Number.isFinite(number) ? { value: number, unit: match[2].trim() } : null;
}

const timeLabel = /^\s*(?:\d{4}-\d{2}(?:-\d{2})?|\d{1,2}\/\d{4}|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر|Q[1-4]|الربع)/i;
export const seriesShape = labels => (labels.length > 6 && labels.every(label => timeLabel.test(label)) ? 'time' : 'category');

export function parseTableSeries(rows, { minPoints = 3, maxPoints = 14 } = {}) {
  if (!Array.isArray(rows) || rows.length < minPoints + 1) return null;
  const width = Math.min(...rows.map(row => row.length));
  if (width < 2) return null;
  const headerIsText = rows[0].every(cell => parseNumber(cell) === null);
  const header = headerIsText ? rows[0] : null;
  const body = headerIsText ? rows.slice(1) : rows;
  if (body.length < minPoints || body.length > maxPoints) return null;

  // The value column is the last one that is numeric all the way down. Taking
  // the last avoids picking an id or a year that happens to sit on the left.
  let column = -1;
  for (let index = width - 1; index >= 1; index -= 1) {
    if (body.every(row => parseNumber(row[index]) !== null)) { column = index; break; }
  }
  if (column < 0) return null;

  const parsed = body.map(row => parseNumber(row[column]));
  const values = parsed.map(item => item.value);
  if (!values.some(value => value > 0) || values.some(value => value < 0)) return null;
  const labels = body.map(row => String(row[0] ?? '').trim()).filter(Boolean);
  if (labels.length !== body.length) return null;
  const units = [...new Set(parsed.map(item => item.unit).filter(Boolean))];
  return {
    title: header ? String(header[column] ?? '').trim() : '',
    labels,
    values,
    unit: units.length === 1 ? units[0] : '',
    shape: seriesShape(labels),
    max: Math.max(...values),
  };
}

// Ticks a reader can name. A bar chart always starts at zero — a truncated
// baseline is the classic way a chart lies about a difference.
export function niceTicks(max, wanted = 4) {
  if (!(max > 0)) return [0];
  const rough = max / Math.max(wanted, 2);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= rough) ?? 10 * magnitude;
  // The top tick must sit at or above the largest value. A scale that stops
  // below its own maximum draws the biggest bar straight off the page.
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + step / 1000; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

export const formatTick = value => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))))
  .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const ink = '#222222';
const muted = '#776C82';
const grid = '#E1DAEB';
const series = '#5E3F9E';

// One measure, one hue, no legend: the title names the series, so colour is
// never the only thing carrying identity.
export function drawSeriesChart(doc, chart, { left, right, drawText, ensureRoom, title = '' }) {
  const heading = String(title || chart.title || '').trim();
  const labelWidth = Math.min((right - left) * 0.34, 170);
  const barHeight = chart.shape === 'time' ? 0 : 15;
  const gap = 8;
  const plotHeight = chart.shape === 'time' ? 150 : chart.values.length * (barHeight + gap);
  const needed = plotHeight + (heading ? 26 : 0) + 42;
  ensureRoom(needed);
  doc.y += 8;
  const top = doc.y + (heading ? 6 : 0);

  if (heading) {
    doc.font('reid-bold').fontSize(11.5).fillColor(ink);
    drawText(heading, { right, left, y: top - 6 });
    doc.y = top + 16;
  }
  const plotTop = doc.y + 4;
  const plotRight = right - (chart.shape === 'time' ? 0 : labelWidth);
  const plotLeft = left + (chart.shape === 'time' ? 46 : 0);
  const ticks = niceTicks(chart.max);
  const span = ticks[ticks.length - 1] || 1;

  doc.save().lineWidth(0.5).strokeColor(grid);
  if (chart.shape === 'time') {
    for (const tick of ticks) {
      const y = plotTop + plotHeight - (tick / span) * plotHeight;
      doc.moveTo(plotLeft, y).lineTo(plotRight, y).stroke();
    }
  } else {
    for (const tick of ticks) {
      const x = plotRight - (tick / span) * (plotRight - plotLeft);
      doc.moveTo(x, plotTop).lineTo(x, plotTop + plotHeight).stroke();
    }
  }
  doc.restore();

  doc.font('reid').fontSize(7.5).fillColor(muted);
  if (chart.shape === 'time') {
    // Time reads left to right even in an Arabic report; the axis labels are
    // Arabic, the direction of time is the one every reader already expects.
    for (const tick of ticks) {
      const y = plotTop + plotHeight - (tick / span) * plotHeight;
      doc.text(formatTick(tick), plotLeft - 44, y - 4, { width: 40, align: 'right', lineBreak: false });
    }
    const stepX = (plotRight - plotLeft) / Math.max(chart.values.length - 1, 1);
    doc.save().lineWidth(2).strokeColor(series);
    chart.values.forEach((value, index) => {
      const x = plotLeft + index * stepX;
      const y = plotTop + plotHeight - (value / span) * plotHeight;
      if (index === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
    });
    doc.stroke().restore();
    chart.values.forEach((value, index) => {
      const x = plotLeft + index * stepX;
      const y = plotTop + plotHeight - (value / span) * plotHeight;
      doc.save().circle(x, y, 2.6).fill(series).restore();
    });
    // Labelling every point turns a line into noise; the ends carry the story.
    doc.font('reid').fontSize(7.5).fillColor(muted);
    [0, chart.values.length - 1].forEach(index => {
      const x = plotLeft + index * stepX;
      doc.text(String(chart.labels[index]).slice(0, 12), x - 26, plotTop + plotHeight + 6, { width: 52, align: 'center', lineBreak: false });
    });
    doc.font('reid-bold').fontSize(8).fillColor(ink);
    const lastX = plotLeft + (chart.values.length - 1) * stepX;
    const lastY = plotTop + plotHeight - (chart.values[chart.values.length - 1] / span) * plotHeight;
    // Kept inside the plot even when the last point is the highest one.
    doc.text(`${formatTick(chart.values[chart.values.length - 1])}${chart.unit ? ` ${chart.unit}` : ''}`, lastX - 62, Math.max(lastY - 13, plotTop), { width: 58, align: 'right', lineBreak: false });
  } else {
    for (const tick of ticks) {
      const x = plotRight - (tick / span) * (plotRight - plotLeft);
      doc.text(formatTick(tick), x - 22, plotTop + plotHeight + 5, { width: 44, align: 'center', lineBreak: false });
    }
    chart.values.forEach((value, index) => {
      const y = plotTop + index * (barHeight + gap);
      // Clamped as a belt-and-braces guard: the scale already covers the max.
      const length = Math.max(Math.min((value / span) * (plotRight - plotLeft), plotRight - plotLeft), 1.5);
      // Bars grow leftward from a baseline on the right: the label sits where
      // an Arabic reader starts the line.
      doc.save().roundedRect(plotRight - length, y, length, barHeight, 3).fill(series);
      doc.rect(plotRight - 3, y, 3, barHeight).fill(series).restore();
      doc.font('reid').fontSize(9).fillColor(ink);
      drawText(String(chart.labels[index]).slice(0, 40), { right, left: plotRight + 6, y: y + 2 });
      doc.font('reid-bold').fontSize(8).fillColor(muted);
      doc.text(`${formatTick(value)}${chart.unit ? ` ${chart.unit}` : ''}`, plotRight - length - 62, y + 3.5, { width: 58, align: 'right', lineBreak: false });
    });
  }

  doc.save().lineWidth(0.7).strokeColor(grid);
  if (chart.shape === 'time') doc.moveTo(plotLeft, plotTop + plotHeight).lineTo(plotRight, plotTop + plotHeight).stroke();
  else doc.moveTo(plotRight, plotTop).lineTo(plotRight, plotTop + plotHeight).stroke();
  doc.restore();

  doc.y = plotTop + plotHeight + 22;
  doc.x = left;
}
