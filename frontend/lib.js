// frontend/lib.js

// URL base de tu API de FastAPI
const API_BASE_URL = 'http://localhost:8000/api/tasks'; // Ajusta el puerto si es necesario

// Nombres para las vistas (útil para el donut)
const MONTH_NAMES = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];
const DAYS_OF_WEEK = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Función que formatea una fecha para mostrar el día y el mes
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return `${DAYS_OF_WEEK[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/**
 * Obtiene la semana del año de una fecha (ISO 8601)
 */
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Obtiene el rango de fechas para una semana específica (para el donut)
 */
function getDatesOfWeek(weekNumber, year) {
    const date = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    date.setDate(date.getDate() - (date.getDay() || 7) + 1); // Lunes
    const week = [];
    for (let i = 0; i < 7; i++) {
        week.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return week;
}