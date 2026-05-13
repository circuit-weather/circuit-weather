export const es = {
    common: { github: 'Ver código fuente en GitHub', loading: 'Cargando...', retry: 'Reintentar', retrying: 'Reintentando...', selectLanguage: 'Idioma', openMenu: 'Abrir menu', closeMenu: 'Cerrar menu', skipToContent: 'Saltar al contenido principal' },
    theme: { toggle: 'Cambiar modo claro/oscuro', switchToLight: 'Cambiar a modo claro', switchToDark: 'Cambiar a modo oscuro' },
    loading: { schedule: 'Cargando calendario de carreras...', session: 'Cargando datos de la sesion...' },
    controls: {
        onlyF1Supported: 'Actualmente solo se admite Formula 1', f1: 'Formula 1',
        series: 'Serie', round: 'Ronda', session: 'Sesion', units: 'Unidades',
        selectRound: 'Selecciona ronda...', selectRoundFirst: 'Selecciona una ronda primero', selectSession: 'Selecciona sesion...',
        metricLabel: 'Kilometros', imperialLabel: 'Millas',
    },
    forecast: {
        heading: 'Pronostico de sesion', hourlyForecast: 'Pronostico por hora',
        availableFrom: 'Pronostico disponible desde {{date}}', availableSoon: 'Pronostico disponible pronto',
        availableCloser: 'Pronostico disponible mas cerca de la sesion', unavailable: 'No se pudo cargar el pronostico',
        failedTryAgain: 'No se pudo cargar el pronostico. Intentalo de nuevo.', selectSessionPrompt: 'Selecciona una sesion para ver el pronostico', emptyStateAria: 'Selecciona una sesión para ver el pronóstico',
    },
    weather: {
        currentConditions: 'Condiciones actuales',
        temp: 'Temp.', rain: 'Lluvia', wind: 'Viento', windDirection: 'Direccion del viento: {{direction}} ({{degrees}} grados)',
        timelineAria: '{{time}}. {{description}}. Temperatura {{temp}} grados. Probabilidad de lluvia {{rain}}%. Viento {{wind}} {{windUnit}}.',
        currentCircuitWeather: 'Tiempo actual del circuito', temperature: 'Temperatura', rainChance: 'Prob. lluvia', humidity: 'Humedad', windSpeed: 'Velocidad del viento',
    },
    radar: {
        play: 'Reproducir radar', pause: 'Pausar radar', playTitle: 'Reproducir (Espacio)', pauseTitle: 'Pausar (Espacio)',
        changePlaybackSpeed: 'Cambiar velocidad de reproducción', playbackSpeed: 'Velocidad de reproduccion: {{speed}}', sessionStart: 'Inicio de sesion', beforeSession: '{{duration}} antes de la sesion',
        afterSession: '{{duration}} despues de la sesion', forecast: 'Pronostico', live: 'En vivo', liveAria: 'Radar en vivo',
        minutesAgo: 'Hace {{count}} min', minutesAgoPlural: 'Hace {{count}} mins', connectionInstability: 'Inestabilidad de conexion',
        serviceError: 'Error del servicio', highTraffic: 'Alto trafico', rateLimitExceeded: 'Limite de peticiones excedido. Pausa momentanea.',
        retryingFailedTiles: 'Reintentando {{count}} tesela{{suffix}} fallida{{suffix}}...', radarStatus: 'Estado del radar: {{status}}',
    },
    countdown: {
        startsIn: 'Empieza en', day: 'dia', dayPlural: 'dias', hour: 'hora', hourPlural: 'horas', minute: 'minuto', minutePlural: 'minutos', second: 'segundo', secondPlural: 'segundos', secondShort: 's', dayShort: 'd', hourShort: 'h'},
    map: { recenterOnCircuit: 'Recentrar en circuito', zoomIn: 'Acercar', zoomOut: 'Alejar' },
    privacy: {
        link: 'Privacidad',
        title: 'Politica de privacidad',
        closePolicy: 'Cerrar politica de privacidad',
        contentAria: 'Contenido de la politica de privacidad',
        opensInNewTab: '(se abre en una pestana nueva)',
        loadFailed: 'No se pudo cargar la politica de privacidad. Intentalo de nuevo mas tarde.',
    },
    errors: {
        connectionFailed: 'Conexion fallida', retryConnection: 'Reintentar conexion', retryingConnection: 'Reintentando conexion',
        initFailed: 'No se pudo iniciar la aplicacion.', sessionError: 'Error de sesion', sessionLoadFailed: 'No se pudo cargar el pronostico o radar de la sesion.',
    },
    status: { live: 'EN VIVO', current: 'Actual', next: 'Siguiente' },
    meta: {
        defaultTitle: 'Circuit Weather — Radar y pronosticos en vivo de F1',
        defaultDesc: 'Sigue la lluvia con Circuit Weather. Radar meteorologico en tiempo real, pronosticos en vivo y cuenta regresiva de sesiones para cada circuito de Formula 1.',
        sessionTitle: '{{raceName}} {{sessionName}} Tiempo - Circuit Weather',
        raceTitle: '{{raceName}} Tiempo - Circuit Weather',
        sessionDesc: 'Radar en vivo, pronosticos y cuenta regresiva para {{raceName}} {{sessionName}}. Sigue la lluvia y las condiciones en tiempo real.',
        raceDesc: 'Radar y pronosticos en vivo para {{raceName}}. Sigue la lluvia y las condiciones durante cada sesion del Gran Premio.',
    },
    weatherCodes: {
        clearSky: 'Cielo despejado', partlyCloudy: 'Parcialmente nublado', fog: 'Niebla', drizzle: 'Llovizna', rain: 'Lluvia',
        snowGrains: 'Granulos de nieve', rainShowers: 'Chubascos', snowShowers: 'Chubascos de nieve', thunderstorm: 'Tormenta', unknown: 'Desconocido',
    },
};
