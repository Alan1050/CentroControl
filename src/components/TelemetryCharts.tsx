import type { AstronautId, MentalState } from '../mission/protocol.ts';

interface EmotionRadarProps {
  astronautId: AstronautId;
  selfReport?: MentalState;
}

const AXES = [
  { label: 'Calma', key: 'calma' },
  { label: 'Concentración', key: 'concentracion' },
  { label: 'Alerta', key: 'alerta' },
  { label: 'Fatiga', key: 'fatiga' },
  { label: 'Estrés', key: 'estres' },
  { label: 'Sobrecarga', key: 'sobrecarga' },
];

export function EmotionRadarChart({ astronautId, selfReport }: EmotionRadarProps) {
  // Valores base según perfil de tripulante (ficticios para demostración)
  const baseValues: Record<AstronautId, Record<string, number>> = {
    A: { calma: 75, concentracion: 85, alerta: 70, fatiga: 30, estres: 25, sobrecarga: 20 },
    B: { calma: 80, concentracion: 90, alerta: 65, fatiga: 40, estres: 30, sobrecarga: 25 },
    C: { calma: 70, concentracion: 80, alerta: 85, fatiga: 35, estres: 35, sobrecarga: 30 },
  };

  const values = { ...(baseValues[astronautId] || baseValues.A) };

  // Reacción dinámica si el astronauta comunicó un estado
  if (selfReport === 'estres') {
    values.estres = 85;
    values.sobrecarga = 75;
    values.calma = 30;
  } else if (selfReport === 'ira') {
    values.estres = 95;
    values.alerta = 90;
    values.calma = 15;
  } else if (selfReport === 'calma') {
    values.calma = 92;
    values.estres = 15;
    values.sobrecarga = 10;
  } else if (selfReport === 'fatiga') {
    values.fatiga = 85;
    values.concentracion = 45;
  }

  const cx = 110;
  const cy = 95;
  const radius = 58;
  const numAxes = AXES.length;

  // Coordenadas de los polígonos concéntricos (niveles 25%, 50%, 75%, 100%)
  const levels = [0.25, 0.5, 0.75, 1.0];
  const levelPolygons = levels.map(level => {
    return AXES.map((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
      const r = radius * level;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  });

  // Coordenadas de la serie de datos del astronauta
  const dataPoints = AXES.map((axis, i) => {
    const val = values[axis.key] ?? 50;
    const norm = Math.max(10, Math.min(100, val)) / 100;
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
    const r = radius * norm;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, val };
  });

  const dataPolygon = dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="radar-chart-container">
      <svg viewBox="0 0 220 195" className="radar-svg" role="img" aria-label="Gráfica de radar de emociones">
        <defs>
          <radialGradient id={`radarGrad-${astronautId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        {/* Polígonos de cuadrícula concéntricos */}
        {levelPolygons.map((pts, idx) => (
          <polygon
            key={idx}
            points={pts}
            fill="none"
            stroke="#263b57"
            strokeWidth={idx === levelPolygons.length - 1 ? '1.2' : '0.8'}
            strokeDasharray={idx < levelPolygons.length - 1 ? '2,2' : undefined}
          />
        ))}

        {/* Ejes radiales */}
        {AXES.map((_, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#2b4363"
              strokeWidth="0.8"
            />
          );
        })}

        {/* Área poligonal de datos */}
        <polygon
          points={dataPolygon}
          fill={`url(#radarGrad-${astronautId})`}
          stroke="#38bdf8"
          strokeWidth="2"
        />

        {/* Puntos en vértices */}
        {dataPoints.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="#59ddbf"
            stroke="#0a1425"
            strokeWidth="1.5"
          />
        ))}

        {/* Etiquetas de cada eje */}
        {AXES.map((axis, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
          const textR = radius + 15;
          const tx = cx + textR * Math.cos(angle);
          const ty = cy + textR * Math.sin(angle);
          const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
          return (
            <text
              key={axis.key}
              x={tx}
              y={ty + 3}
              textAnchor={anchor}
              className="radar-label"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface RadiationLineProps {
  astronautId: AstronautId;
}

export function RadiationLineChart({ astronautId }: RadiationLineProps) {
  // Series de tiempo ficticias de tasa de dosis de radiación en µSv/h
  const seriesData: Record<AstronautId, number[]> = {
    A: [0.22, 0.24, 0.23, 0.28, 0.27, 0.32, 0.34, 0.37, 0.40, 0.43],
    B: [0.18, 0.19, 0.21, 0.20, 0.23, 0.25, 0.26, 0.28, 0.29, 0.31],
    C: [0.25, 0.26, 0.28, 0.31, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48],
  };

  const points = seriesData[astronautId] || seriesData.A;
  const currentVal = points.at(-1) ?? 0.4;

  const w = 240;
  const h = 85;
  const padLeft = 24;
  const padRight = 14;
  const padTop = 10;
  const padBottom = 20;

  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;

  const minVal = 0.15;
  const maxVal = 0.55;

  const coords = points.map((val, idx) => {
    const x = padLeft + (idx / (points.length - 1)) * chartW;
    const y = padTop + (1 - (val - minVal) / (maxVal - minVal)) * chartH;
    return { x, y, val };
  });

  const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${coords.at(-1)!.x.toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`;

  return (
    <div className="radiation-chart-container">
      <div className="radiation-stat-row">
        <span className="rad-indicator-dot" />
        <span className="rad-current-text">
          Dosis actual: <strong>{currentVal.toFixed(2)} µSv/h</strong>
        </span>
        <span className="rad-nominal-tag">SEGURO</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="radiation-svg" role="img" aria-label="Gráfica temporal de radiación">
        <defs>
          <linearGradient id={`radGrad-${astronautId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Líneas de cuadrícula horizontales */}
        {[0.2, 0.35, 0.5].map((level, i) => {
          const y = padTop + (1 - (level - minVal) / (maxVal - minVal)) * chartH;
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={w - padRight}
                y2={y}
                stroke="#1f344f"
                strokeWidth="0.8"
                strokeDasharray="2,2"
              />
              <text x={padLeft - 4} y={y + 3} textAnchor="end" className="chart-grid-text">
                {level.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Área degradada */}
        <path d={areaPath} fill={`url(#radGrad-${astronautId})`} />

        {/* Línea de datos continua */}
        <path
          d={linePath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Último punto resaltado */}
        {coords.length > 0 && (
          <circle
            cx={coords.at(-1)!.x}
            cy={coords.at(-1)!.y}
            r="4"
            fill="#59ddbf"
            stroke="#0a1425"
            strokeWidth="2"
          />
        )}

        {/* Marcadores de tiempo en eje X */}
        <text x={padLeft} y={h - 4} className="chart-grid-text" textAnchor="start">-30m</text>
        <text x={padLeft + chartW / 2} y={h - 4} className="chart-grid-text" textAnchor="middle">-15m</text>
        <text x={w - padRight} y={h - 4} className="chart-grid-text" textAnchor="end">Ahora</text>
      </svg>
    </div>
  );
}
