# NeuroOrbit Lab · Centro de control

Panel web para visualizar la salud y el bienestar de una tripulación de astronautas. Reúne la información de cada integrante y una gráfica de presión arterial en una interfaz adaptable a distintos tamaños de pantalla.

**Estado actual:** prototipo de interfaz. Las tarjetas y las gráficas están preparadas para recibir datos, pero todavía no hay conexión con sensores, API ni almacenamiento persistente.

## Funciones actuales

- Tarjetas individuales para los astronautas A, B y C.
- Campos para nombre, estado, nivel de radiación y estado mental, pendientes de conectar a datos.
- Gráficas de presión sistólica y diastólica en **mmHg**, dibujadas con SVG sin una biblioteca de gráficas adicional.
- Estado vacío «Sin lecturas registradas» cuando no hay mediciones disponibles.
- Distribución de una, dos o tres columnas según el ancho de pantalla.
- Tema claro u oscuro según la preferencia del sistema.
- Footer al pie de la ventana cuando hay poco contenido y al final de la página cuando el contenido crece.

## Tecnologías

| Tecnología | Uso |
| --- | --- |
| React | Componentes e interfaz de usuario. |
| TypeScript | Tipado de componentes y lecturas biométricas. |
| Vite | Servidor de desarrollo y compilación de producción. |
| CSS | Diseño adaptable, temas y estilos de los componentes. |
| SVG | Ejes, cuadrícula y series de las gráficas. |
| ESLint | Análisis estático del código. |


## Estructura del proyecto

```text
CentroControl/
├── public/                       # Recursos estáticos
├── src/
│   ├── assets/                   # Identidad visual de NeuroOrbit Lab
│   ├── components/
│   │   ├── BloodPressureChart.tsx # Gráfica y tipo de lectura de presión arterial
│   │   ├── BloodPressureChart.css
│   │   ├── Card.tsx               # Tarjeta reutilizable de cada astronauta
│   │   ├── Header.tsx
│   │   ├── Header.css
│   │   ├── Footer.tsx
│   │   └── Footer.css
│   ├── App.tsx                    # Lista de astronautas y lecturas por integrante
│   ├── App.css                    # Distribución del panel y tarjetas
│   ├── index.css                  # Estilos globales y variables de tema
│   └── main.tsx                   # Entrada de React
├── index.html
├── package.json
├── package-lock.json
└── vite.config.ts
```

## Equipo del proyecto

- Iris Anahi Vargas Brambila.
- Kevin Yahir Bernal Aguirre.
- [Alan Emir Medina Delgado](https://devalanmedina.netlify.app/).

-----

Propuesta realizada para el [NASA SPACE APPS CHALLENGE Edición 2026](https://www.spaceappschallenge.org/) en el reto #5 denominado como "Create Health Monitoring Software for Astronauts on Space Missions"