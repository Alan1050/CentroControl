import BloodPressureChart from './BloodPressureChart.tsx'
import type { BloodPressureReading } from './BloodPressureChart.tsx'

type CardProps = {
  astronautId: string
  position: number
  readings: readonly BloodPressureReading[]
}

const fields = ['Nombre', 'Estado', 'Nivel de radiación', 'Estado mental']

function Card({ astronautId, position, readings }: CardProps) {
  const astronautName = `Astronauta ${astronautId}`

  return (
    <article className="astronaut-card" data-astronaut={astronautId} aria-labelledby={`astronaut-${astronautId}`}>
      <div className="astronaut-card__heading">
        <div className="astronaut-card__avatar" aria-hidden="true">
          <svg viewBox="0 0 28 28" fill="none">
            <path d="M6 15v-3a8 8 0 0 1 16 0v3a8 8 0 0 1-16 0Z" />
            <rect x="9" y="8" width="10" height="8" rx="3" />
            <path d="M5 12H3v5h3m16-5h3v5h-3M9 21v3h10v-3M12 11h3" />
          </svg>
        </div>
        <div>
          <p className="astronaut-card__number">Tripulante {String(position).padStart(2, '0')}</p>
          <h2 id={`astronaut-${astronautId}`}>{astronautName}</h2>
        </div>

      </div>

      <dl className="astronaut-card__details">
        {fields.map((field) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd aria-label="Sin datos">—</dd>
          </div>
        ))}
      </dl>

      <BloodPressureChart astronautName={astronautName} readings={readings} />
    </article>
  )
}

export default Card
