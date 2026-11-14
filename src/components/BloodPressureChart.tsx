import './BloodPressureChart.css'

export type BloodPressureReading = {
  /** Fecha de la lectura en milisegundos desde Unix epoch. */
  timestamp: number
  systolic: number
  diastolic: number
}

type BloodPressureChartProps = {
  astronautName: string
  readings?: readonly BloodPressureReading[]
}

const plot = { left: 42, right: 404, top: 16, bottom: 196 }

function BloodPressureChart({
  astronautName,
  readings = [],
}: BloodPressureChartProps) {
  const validReadings = readings
    .filter((reading) => (
      Number.isFinite(reading.timestamp)
      && Number.isFinite(reading.systolic)
      && Number.isFinite(reading.diastolic)
      && reading.systolic >= 0
      && reading.diastolic >= 0
    ))
    .toSorted((a, b) => a.timestamp - b.timestamp)

  const highestPressure = validReadings.reduce(
    (highest, reading) => Math.max(highest, reading.systolic, reading.diastolic),
    0,
  )
  const tickStep = Math.max(50, Math.ceil(highestPressure / 4 / 10) * 10)
  const maxPressure = tickStep * 4
  const firstTimestamp = validReadings[0]?.timestamp ?? 0
  const lastTimestamp = validReadings.at(-1)?.timestamp ?? 0

  const getX = (timestamp: number) => (
    firstTimestamp === lastTimestamp
      ? (plot.left + plot.right) / 2
      : plot.left + ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp))
        * (plot.right - plot.left)
  )
  const getY = (pressure: number) => (
    plot.bottom - (pressure / maxPressure) * (plot.bottom - plot.top)
  )
  const getPoints = (measurement: 'systolic' | 'diastolic') => (
    validReadings
      .map((reading) => `${getX(reading.timestamp)},${getY(reading[measurement])}`)
      .join(' ')
  )

  return (
    <figure className="blood-pressure-chart" aria-label={`Presión arterial de ${astronautName}`}>
      <figcaption className="blood-pressure-chart__heading">
        <h3>Presión arterial</h3>
        <span>mmHg</span>
      </figcaption>

      <ul className="blood-pressure-chart__legend" aria-label="Series de la gráfica">
        <li><span className="blood-pressure-chart__swatch blood-pressure-chart__swatch--systolic" />Sistólica</li>
        <li><span className="blood-pressure-chart__swatch blood-pressure-chart__swatch--diastolic" />Diastólica</li>
      </ul>

      <div className="blood-pressure-chart__plot">
        <svg viewBox="0 0 420 230" role="img" aria-label={
          validReadings.length === 0
            ? `Gráfica de presión arterial de ${astronautName}, sin lecturas registradas`
            : `Presión sistólica y diastólica de ${astronautName} en mmHg a lo largo del tiempo`
        }>
          {[4, 3, 2, 1, 0].map((tick) => {
            const pressure = tick * tickStep

            return (
              <g key={tick}>
                <line
                  className="blood-pressure-chart__grid"
                  x1={plot.left}
                  x2={plot.right}
                  y1={getY(pressure)}
                  y2={getY(pressure)}
                />
                <text className="blood-pressure-chart__tick" x="32" y={getY(pressure) + 4} textAnchor="end">
                  {pressure}
                </text>
              </g>
            )
          })}

          <line className="blood-pressure-chart__axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
          <line className="blood-pressure-chart__axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
          <text className="blood-pressure-chart__tick" x={(plot.left + plot.right) / 2} y="222" textAnchor="middle">
            Tiempo
          </text>

          {validReadings.length > 0 && (
            <>
              <polyline className="blood-pressure-chart__line blood-pressure-chart__line--systolic" points={getPoints('systolic')} />
              <polyline className="blood-pressure-chart__line blood-pressure-chart__line--diastolic" points={getPoints('diastolic')} />
              {validReadings.length === 1 && (
                <>
                  <circle className="blood-pressure-chart__point--systolic" cx={getX(firstTimestamp)} cy={getY(validReadings[0].systolic)} r="3" />
                  <circle className="blood-pressure-chart__point--diastolic" cx={getX(firstTimestamp)} cy={getY(validReadings[0].diastolic)} r="3" />
                </>
              )}
            </>
          )}
        </svg>

        {validReadings.length === 0 && (
          <p className="blood-pressure-chart__empty">Sin lecturas registradas</p>
        )}
      </div>
    </figure>
  )
}

export default BloodPressureChart
