// frontend/app.js
// Archivo completo y autocontenido. Depende de que d3.js se haya cargado en index.html.

// --- 0. CONSTANTES GLOBALES Y API BASE ---

const API_BASE_URL = 'http://127.0.0.1:8000/api/tasks'; // FIX: Usar 127.0.0.1 para evitar conflicto CORS con localhost
const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Nombres de los meses en español para las etiquetas
const MONTH_NAMES_ES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
];

// Paleta de 12 colores distintivos para los meses (Requisito 2)
const MONTH_COLORS = [
    '#FF7F50', // Enero (Coral)
    '#FFD700', // Febrero (Dorado)
    '#7FFF00', // Marzo (Chartreuse)
    '#00CED1', // Abril (Turquesa Oscuro)
    '#1E90FF', // Mayo (Azul Intenso)
    '#FF1493', // Junio (Rosa Profundo)
    '#8A2BE2', // Julio (Azul Violeta)
    '#FFA07A', // Agosto (Salmón Claro)
    '#3CB371', // Septiembre (Verde Medio)
    '#FF4500', // Octubre (Naranja Rojizo)
    '#DDA0DD', // Noviembre (Ciruela)
    '#ADD8E6'  // Diciembre (Azul Claro)
];

// Almacenar todas las tareas globalmente después de cargarlas para la vista semanal
let ALL_TASKS = [];

// VARIABLE GLOBAL PARA FIJAR EL POPUP
let FIXED_POPUP_WEEK = null;

// GESTIÓN DE AÑOS DE VISUALIZACIÓN
let CURRENT_VIEW_YEAR = new Date().getFullYear(); // Empieza en 2025
const MIN_YEAR = 2025;
const MAX_YEAR = 2026; 


// --- 1. ENTRADA PRINCIPAL Y CONFIGURACIÓN DEL DOM ---

document.addEventListener('DOMContentLoaded', () => {
    // Verificar D3.js
    if (typeof d3 === 'undefined') {
        document.getElementById("annual-donut-container").innerHTML = '<p style="color:var(--color-accent);">ERROR: D3.js library not loaded.</p>';
        return;
    }
    
    // Inicialización
    loadTasks();
    
    // Configuración del formulario
    const taskForm = document.getElementById('task-form');
    taskForm.addEventListener('submit', handleFormSubmit);
    
    // Botón de cancelar edición
    document.getElementById('cancel-edit').addEventListener('click', () => {
        clearForm();
    });

    // Ocultar resumen al inicio
    document.getElementById('weekly-summary-popup').style.display = 'none';

    // Iniciar la actualización del reloj/resumen (cada segundo)
    setInterval(() => renderTodaySummary(ALL_TASKS), 1000);

    // Configuración de la navegación anual
    document.getElementById('prev-year').addEventListener('click', () => navigateAnnualView(-1));
    document.getElementById('next-year').addEventListener('click', () => navigateAnnualView(1));
    
    // Añadir botón de Eliminar al formulario de Edición
    const submitButton = document.getElementById('submit-button');
    const deleteButton = document.createElement('button');
    deleteButton.setAttribute('type', 'button');
    deleteButton.setAttribute('id', 'delete-task-btn');
    deleteButton.textContent = 'ELIMINAR TAREA [DELETE]';
    deleteButton.style.display = 'none'; // Oculto por defecto
    deleteButton.onclick = handleDeleteFromEditForm;
    submitButton.parentNode.insertBefore(deleteButton, submitButton.nextSibling);
});

// --- 2. LÓGICA CRUD Y API WRAPPERS ---

async function readTasks() {
    try {
        const response = await fetch(API_BASE_URL);
        if (!response.ok) throw new Error('Error al obtener las tareas');
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        alert('No se pudo conectar al servidor de FastAPI o a Supabase.');
        return null;
    }
}

async function createTask(taskData) {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    if (!response.ok) throw new Error('Error al crear la tarea');
}

async function updateTask(id, taskData) {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    if (!response.ok) throw new Error('Error al actualizar la tarea');
}

async function deleteTask(id) {
    const response = await fetch(`${API_BASE_URL}/${id}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Error al eliminar la tarea');
}

// --- 3. LÓGICA DEL FORMULARIO Y DATOS ---

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const taskId = document.getElementById('task-id').value;
    const taskData = getTaskDataFromForm();
    
    if (!taskData.due_date) {
        alert("Por favor, selecciona una fecha y hora para la tarea.");
        return;
    }

    try {
        if (taskId) {
            await updateTask(taskId, taskData);
        } else {
            await createTask(taskData);
        }
        
        await loadTasks();
        clearForm();
        
    } catch (error) {
        console.error("Save error:", error);
        alert("Error al guardar la tarea. Revisa el backend y la conexión a Supabase.");
    }
}

async function handleDeleteFromEditForm() {
    const taskId = document.getElementById('task-id').value;
    
    if (!taskId) return;

    try {
        await deleteTask(taskId);
        await loadTasks();
        clearForm();
    } catch (error) {
        console.error("Delete error:", error);
        alert("Error al eliminar la tarea. Revisa el backend y la conexión a Supabase.");
    }
}

function getTaskDataFromForm() {
    const localValue = document.getElementById('task-due-date').value;
    
    // CORRECCIÓN CLAVE ANTERIOR: No se añade 'Z'. Esto hace que el backend interprete
    // la hora como hora local sin conversión a UTC.
    const isoString = localValue ? localValue + ':00.000' : ''; 

    return {
        title: document.getElementById('task-title').value,
        description: document.getElementById('task-description').value,
        due_date: isoString, 
        is_completed: false 
    };
}

function clearForm() {
    const submitButton = document.getElementById('submit-button');
    const deleteButton = document.getElementById('delete-task-btn');
    
    document.getElementById('task-id').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-due-date').value = '';
    
    submitButton.textContent = 'GUARDAR Y EJECUTAR [COMMIT]'; 
    document.getElementById('cancel-edit').style.display = 'none';
    deleteButton.style.display = 'none'; // Ocultar botón de eliminar
}

function editTask(task) {
    const submitButton = document.getElementById('submit-button');
    const deleteButton = document.getElementById('delete-task-btn');
    
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description;
    
    const localDate = new Date(task.due_date);
    const dateString = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    document.getElementById('task-due-date').value = dateString;

    submitButton.textContent = 'ACTUALIZAR Y EJECUTAR [COMMIT EDIT]'; 
    document.getElementById('cancel-edit').style.display = 'block';
    deleteButton.style.display = 'block'; // Mostrar botón de eliminar
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadTasks() {
    const tasks = await readTasks();
    if (!tasks) return;
    
    ALL_TASKS = tasks; // Almacenar TODAS las tareas globalmente (2025 + 2026)
    
    // Renderizar la vista de agenda con TODAS las tareas, centrada en hoy
    renderWeeklyView(ALL_TASKS, new Date()); 
    
    // Renderizar resumen diario
    renderTodaySummary(ALL_TASKS);

    // Dibujar la Matriz Anual para el año actual de visualización
    drawAnnualViewForYear(CURRENT_VIEW_YEAR); 
}

// --- NAVEGACIÓN ANUAL ---
function navigateAnnualView(direction) {
    const newYear = CURRENT_VIEW_YEAR + direction;
    
    if (newYear >= MIN_YEAR && newYear <= MAX_YEAR) {
        CURRENT_VIEW_YEAR = newYear;
        drawAnnualViewForYear(CURRENT_VIEW_YEAR);
    }
}

function drawAnnualViewForYear(year) {
    const yearDisplay = document.getElementById("current-year-display");
    const prevBtn = document.getElementById("prev-year");
    const nextBtn = document.getElementById("next-year");

    // Actualizar título
    yearDisplay.textContent = year;
    
    // Control de botones (se desactivan si el año excede los límites conocidos)
    prevBtn.disabled = year <= MIN_YEAR;
    nextBtn.disabled = year >= MAX_YEAR;
    
    // Filtrar tareas y dibujar
    const tasksForAnnualView = ALL_TASKS.filter(task => new Date(task.due_date).getFullYear() === year);
    const groupedTasks = groupTasksByWeek(tasksForAnnualView); 
    
    drawAnnualDonut(tasksForAnnualView, groupedTasks, year); 
}


// -------------------------------------------------------------
// 4. VISTA ANUAL (DONUT D3)
// -------------------------------------------------------------

/**
 * Determina si la semana es pasada o futura/actual.
 */
function getWeekStatusClass(weekNumber, displayYear) {
    const today = new Date();
    const currentRealYear = today.getFullYear();

    // 1. Si el año mostrado es futuro al año real (e.g., viendo 2026 en 2025), todo es futuro (blanco).
    if (displayYear > currentRealYear) {
        return 'future-or-current-week';
    }

    // 2. Si el año mostrado es pasado al año real (e.g., viendo 2025 en 2026), todo es pasado (negro).
    if (displayYear < currentRealYear) {
        return 'past-week';
    }
    
    // 3. Si estamos en el mismo año, calculamos:
    const yearStart = new Date(currentRealYear, 0, 1);
    const week0Start = d3.timeWeek.floor(yearStart);
    const currentWeekIndex = d3.timeWeek.count(week0Start, d3.timeWeek.floor(today));

    if (weekNumber < currentWeekIndex) {
        return 'past-week'; // Semanas que ya han pasado
    } else {
        return 'future-or-current-week'; // Semana actual y futuras
    }
}

function getWeekColorClass(weekTasks) {
    if (weekTasks.length === 0) {
        return 'task-load-none'; // 0 días
    }
    
    // Contar días distintos planificados
    const distinctDays = new Set();
    weekTasks.forEach(task => {
        distinctDays.add(new Date(task.due_date).toISOString().split('T')[0]); 
    });

    const plannedDaysCount = distinctDays.size;

    // 1-4 días -> Naranja (Low), 5-7 días -> Verde (High)
    if (plannedDaysCount >= 1 && plannedDaysCount <= 4) {
        return 'task-load-low'; 
    } else if (plannedDaysCount >= 5) {
        return 'task-load-high'; 
    } else {
        return 'task-load-none'; 
    }
}

function drawAnnualDonut(allTasks, groupedTasks, displayYear) {
    // Aumentar el tamaño del gráfico
    const width = 800; 
    const height = 800;
    const radius = Math.min(width, height) / 2; // 400
    const innerRadius = radius * 0.45; // Centro para el año
    const outerRadius = radius * 0.9; // Ajustado ligeramente

    const container = d3.select("#annual-donut-container");
    container.select("svg").remove(); 
    container.html(''); 

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // --- Definición de ángulos para cumplir los requisitos del usuario ---
    
    // 53 rebanadas para 53 semanas
    const weeksData = d3.range(53).map(i => ({ week: i })); 
    
    const anglePerWeek = (2 * Math.PI) / 53;
    
    // El inicio del año original era PI/2. La semana 13 tiene un desplazamiento de 13 * anglePerWeek.
    const originalStartAngle = Math.PI / 2; 
    const targetAngle = originalStartAngle + (13 * anglePerWeek); // Ángulo donde queremos que esté el inicio del año
    
    
    // Ahora definimos el nuevo generador de pastel (pie)
    const pie = d3.pie()
        .value(1) 
        .sort(null)
        // El año empieza en la posición que antes ocupaba la Semana 13.
        // Avanza en sentido ANTIHORARIO.
        .startAngle(targetAngle) 
        .endAngle(targetAngle - (2 * Math.PI)); // El círculo se traza hacia atrás

    const pieData = pie(weeksData);
    const pieDataMap = new Map(pieData.map(d => [d.data.week, d]));

    // Generador de arco para el FONDO DE MESES
    const monthArc = d3.arc()
        .innerRadius(innerRadius) 
        .outerRadius(outerRadius); 

    // Generador de arco para la CARGA SEMANAL (Subsecciones)
    const weekLoadArc = d3.arc()
        .innerRadius(innerRadius * 1.1) 
        .outerRadius(outerRadius * 0.9); 
    
    // Nuevo arco para centrar las etiquetas de mes (dentro de la franja)
    const labelRadius = innerRadius + (outerRadius - innerRadius) / 2;
    const internalLabelArc = d3.arc()
        .innerRadius(labelRadius)
        .outerRadius(labelRadius);

    // --- CÁLCULO REAL DE LAS FRONTERAS DE MESES ---
    
    const year = displayYear; // Usamos el año que se está visualizando
    const accurateMonthSlices = [];

    // Definir la fecha de inicio de la Semana 0 (la semana que contiene Jan 1)
    const yearStart = new Date(year, 0, 1);
    const week0Start = d3.timeWeek.floor(yearStart); // Fecha de inicio de la Semana 0 (Domingo)

    for (let m = 0; m < 12; m++) {
        const monthStart = new Date(year, m, 1);
        const monthEnd = new Date(year, m + 1, 0); // Último día del mes
        
        // 1. Encontrar el índice de la semana que contiene el día 1 del mes.
        const firstWeekIndex = d3.timeWeek.count(week0Start, d3.timeWeek.floor(monthStart));
        
        // 2. Encontrar el índice de la semana que contiene el último día del mes.
        const lastWeekIndex = d3.timeWeek.count(week0Start, d3.timeWeek.floor(monthEnd));

        const startIdx = Math.max(0, firstWeekIndex); // Asegura que el índice no sea negativo
        const endIdx = Math.min(52, lastWeekIndex); // Asegura que no exceda 52
        
        // 3. Obtener los ángulos de inicio y fin de la rebanada del pastel (pie slice)
        const startPieData = pieDataMap.get(startIdx);
        const endPieData = pieDataMap.get(endIdx);

        if (!startPieData || !endPieData) {
             continue;
        }

        const monthStartAngle = startPieData.startAngle;
        
        // El ángulo final es el ángulo de inicio de la *siguiente* semana.
        let monthEndAngle;
        if (endIdx < 52) {
            // Usa el startAngle de la siguiente semana
            const nextWeekPieData = pieDataMap.get(endIdx + 1);
            monthEndAngle = nextWeekPieData ? nextWeekPieData.startAngle : pieDataMap.get(52).endAngle;
        } else {
            // Si es la última semana (52), usa su propio end angle.
            monthEndAngle = endPieData.endAngle;
        }
        
        // Solo añade si el mes tiene un ángulo positivo
        if (monthStartAngle > monthEndAngle) { 
             accurateMonthSlices.push({
                monthIndex: m,
                startAngle: monthStartAngle,
                endAngle: monthEndAngle,
            });
        }
    }

    // --- DIBUJO ---
    
    // 1. Dibuja el fondo de color del mes (capa de color de la sección)
    svg.selectAll(".month-background")
        .data(accurateMonthSlices) 
        .enter()
        .append("path")
        .attr("d", monthArc)
        .attr("class", "month-background")
        .style("fill", d => MONTH_COLORS[d.monthIndex]) 
        .style("opacity", 0.1); 

    // 2. Dibuja los Arcos de Semanas (Carga de Tareas)
    svg.selectAll(".week-slice-group")
        .data(pieData)
        .enter()
        .append("g")
        .attr("class", "week-slice-group")
        .append("path")
        .attr("d", weekLoadArc) 
        .attr("class", d => {
            const weekTasks = groupedTasks[d.data.week] || [];
            // Incluye la clase de carga y la clase de estado temporal
            const loadClass = getWeekColorClass(weekTasks); 
            const statusClass = getWeekStatusClass(d.data.week, displayYear); // Usamos el año de visualización
            return "week-slice " + loadClass + " " + statusClass; 
        })
        
        // Borde para separar los meses (más grueso y con color acento)
        .style("stroke-width", (d, i) => {
            // Lógica para detectar el inicio de un nuevo mes
            const isMonthStart = accurateMonthSlices.some(s => {
                // Compara el ángulo de inicio de la semana con el ángulo de inicio del mes (tolerancia pequeña por flotantes)
                return Math.abs(s.startAngle - d.startAngle) < 0.0001; 
            });
            return isMonthStart ? "3px" : "1px";
        })
        .style("stroke", (d, i) => {
             const isMonthStart = accurateMonthSlices.some(s => {
                return Math.abs(s.startAngle - d.startAngle) < 0.0001;
            });
            if (isMonthStart) {
                return "var(--color-accent)"; 
            }
            return "var(--color-bg)"; 
        })
        
        // Hover/Popup - Modificado
        .on("mouseover", function(event, d) {
            // Solo muestra el popup si no está fijado O si está fijado a esta semana.
            if (FIXED_POPUP_WEEK === null || FIXED_POPUP_WEEK === d.data.week) {
                 showPopupSummary(event, d, groupedTasks);
            }
        })
        .on("mouseout", function(event, d) {
            // Solo oculta si NO está fijado
            if (FIXED_POPUP_WEEK === null) {
                hidePopupSummary();
            }
        })
        
        // EVENTO CLICK: Fijar/Desfijar el popup y Navegar
        .on("click", function(event, d) {
            const weekNumber = d.data.week;
            const year = displayYear; // Usamos el año actual de visualización
            
            // 1. Manejar la fijación del popup
            if (FIXED_POPUP_WEEK === weekNumber) {
                // Si ya estaba fijado a esta semana, desfijar (ocultar)
                FIXED_POPUP_WEEK = null;
                hidePopupSummary();
            } else {
                // Si no estaba fijado o estaba fijado a otra semana, fijar a esta
                FIXED_POPUP_WEEK = weekNumber;
                showPopupSummary(event, d, groupedTasks);
            }

            // 2. Navegar a la vista semanal (comportamiento anterior)
            const dateToFocus = getStartDateOfWeek(weekNumber, year);
            focusWeeklyViewOnDate(dateToFocus);
            
            // Prevenir que el evento MouseOut oculte el popup si fue fijado
            event.preventDefault(); 
        });

    // 3. Etiquetas de Meses (Dentro del Mes)
    svg.selectAll(".month-label")
        .data(accurateMonthSlices) 
        .enter().append("text")
        .attr("transform", function(d) {
            const pos = internalLabelArc.centroid(d); 
            const midAngle = (d.startAngle + d.endAngle) / 2;
            const angle = (midAngle * 180 / Math.PI) - 90; 

            let rotation = angle;
            // Rotación para lectura en sentido antihorario.
            if (angle > 90 || angle < -90) {
                rotation += 180;
            }
            
            return `translate(${pos}) rotate(${rotation})`;
        })
        .attr("text-anchor", "middle")
        .attr("class", "month-label") 
        .style("fill", d => MONTH_COLORS[d.monthIndex]) // Usar el color del mes para la etiqueta
        .text(d => MONTH_NAMES_ES[d.monthIndex]);


    // Texto central
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("font-size", "2.5em")
        .attr("font-weight", "bold")
        .text(displayYear) // Usa el año actual de visualización
        .attr('fill', 'var(--color-accent)');
}

/**
 * Calcula la fecha de inicio (Domingo) de una semana del año.
 */
function getStartDateOfWeek(weekNumber, year) {
    const Jan1 = new Date(year, 0, 1);
    const week0Start = d3.timeWeek.floor(Jan1); // Fecha de inicio de la Semana 0 (Domingo)
    return d3.timeWeek.offset(week0Start, weekNumber);
}

/**
 * Calcula el rango de fechas (Domingo a Sábado) para una semana del año.
 */
function getDateRangeOfWeek(weekNumber, year) {
    const startDate = getStartDateOfWeek(weekNumber, year);
    // El final de la semana es 6 días después.
    const endDate = d3.timeDay.offset(startDate, 6); 
    
    // Formatear las fechas como DD/MM
    const format = d3.timeFormat("%d/%m"); 
    const startStr = format(startDate);
    const endStr = format(endDate);

    return `${startStr} - ${endStr}`;
}

/**
 * Renderiza el resumen de las tareas de hoy en el panel izquierdo.
 */
function renderTodaySummary(allTasks) {
    const container = document.getElementById('today-summary');
    const now = new Date();
    // Reajusta el timeFormat para mostrar la hora actualizada
    const time = now.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit', second: '2-digit'}); 
    
    const todayStr = d3.timeFormat("%Y-%m-%d")(now);
    
    // Información de la fecha
    const dayName = DAYS_OF_WEEK[now.getDay()];
    const dateNum = now.getDate();
    const monthName = MONTH_NAMES_ES[now.getMonth()];
    
    // Filtrar tareas de hoy
    const tasksToday = allTasks
        .filter(task => d3.timeFormat("%Y-%m-%d")(new Date(task.due_date)) === todayStr)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    let taskListHTML = '';
    if (tasksToday.length > 0) {
        taskListHTML += '<ul>';
        tasksToday.forEach(task => {
            const taskTime = new Date(task.due_date).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
            taskListHTML += `<li>[${taskTime}] ${task.title}</li>`;
        });
        taskListHTML += '</ul>';
    } else {
        taskListHTML = '<p>🎉 No hay tareas asignadas para hoy.</p>';
    }

    container.innerHTML = `
        <p class="today-date-info">
            HOY: ${dayName}, ${dateNum} de ${monthName} (${time})
        </p>
        <p>Tareas pendientes para ${dateNum} de ${monthName}: (${tasksToday.length} en total)</p>
        ${taskListHTML}
    `;
}


function showPopupSummary(event, d, groupedTasks) {
    // Resumen día por día
    const weekNumber = d.data.week;
    const tasks = groupedTasks[weekNumber] || [];
    const popup = d3.select("#weekly-summary-popup");
    const year = CURRENT_VIEW_YEAR; // Usa el año que se está visualizando
    
    // OBTENER RANGO DE FECHAS
    const dateRange = getDateRangeOfWeek(weekNumber, year);

    // Agrupar tareas por día
    const tasksByDay = {};
    tasks.forEach(t => {
        const date = new Date(t.due_date);
        const dayOfWeek = DAYS_OF_WEEK[date.getDay()];
        const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const time = date.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
        
        const key = `${dayOfWeek} (${dateStr})`;
        if (!tasksByDay[key]) {
            tasksByDay[key] = [];
        }
        // Guardar el ID de la tarea junto con el HTML para el botón de eliminar
        tasksByDay[key].push({
            html: `[${time}] ${t.title}`,
            id: t.id,
            title: t.title
        });
    });

    let dayListHTML = '';
    // Iterar sobre los días para generar la lista
    for (const day in tasksByDay) {
        dayListHTML += `<li class="day-separator">${day}</li>`;
        tasksByDay[day].forEach(task => {
            // Añadir botón de eliminar con el ID de la tarea
            dayListHTML += `
                <li class="task-detail" data-task-id="${task.id}" data-task-title="${task.title}">
                    ${task.html} 
                    <button class="delete-popup-btn" data-task-id="${task.id}" data-task-title="${task.title}">[X]</button>
                </li>`;
        });
    }

    popup.html(`
        <h4>RESUMEN SEMANA ${weekNumber} (${dateRange})</h4> 
        <p>Total Tareas: ${tasks.length}</p> 
        <hr>
        ${tasks.length > 0 ? '<ul>' + dayListHTML + '</ul>' : '<p>No hay tareas planificadas.</p>'} 
    `)
    .style("display", "block")
    .style("left", `${event.pageX + 15}px`)
    .style("top", `${event.pageY - 15}px`);
    
    // 📢 LÓGICA: Añadir listeners a los botones de eliminar después de renderizar el HTML
    popup.selectAll(".delete-popup-btn").on("click", function(e) {
        // Detener la propagación para que el popup no desaparezca inmediatamente si se hace clic dentro de él
        e.stopPropagation(); 
        
        const taskId = this.getAttribute('data-task-id');
        const taskTitle = this.getAttribute('data-task-title');
        
        if (confirm(`Confirmar eliminación de la tarea: ${taskTitle} (ID: ${taskId})?`)) { 
            // Eliminar la tarea y recargar todo el calendario
            deleteTask(taskId).then(() => {
                loadTasks();
                // Si el popup estaba fijado, lo desfijamos al completar la acción
                FIXED_POPUP_WEEK = null; 
            }).catch(error => {
                console.error("Error deleting task from popup:", error);
                alert("Error al eliminar la tarea.");
            });
            // Ocultar el popup inmediatamente para dar feedback visual
            hidePopupSummary();
        }
    });
}

function hidePopupSummary() {
    d3.select("#weekly-summary-popup").style("display", "none");
}


// --- 5. LÓGICA DE VISTA SEMANAL (LINEAL) Y NAVEGACIÓN ---

/**
 * FUNCIÓN CLAVE PARA LA INTERACTIVIDAD
 * Renderiza la VISTA SEMANAL de 7 días, comenzando en la fecha proporcionada.
 */
function focusWeeklyViewOnDate(startDate) {
    // Reutiliza la función de renderizado existente, pero con un punto de inicio específico
    renderWeeklyView(ALL_TASKS, startDate); 
    
    // Desplazar la vista al panel de la agenda si está fuera de pantalla
    const agendaPanel = document.getElementById('left-panel');
    agendaPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/**
 * Renderiza la vista de 7 días.
 */
function renderWeeklyView(allTasks, startDay) { 
    const viewContainer = document.getElementById('weekly-view');
    viewContainer.innerHTML = ''; 

    // CAMBIO CLAVE: Ajustar el día de inicio a Lunes.
    // d3.timeMonday.floor(startDay) asegura que siempre empezamos en el Lunes de esa semana.
    const startMonday = d3.timeMonday.floor(startDay);

    for (let i = 0; i < 7; i++) {
        // i=0 es Lunes, i=6 es Domingo
        const date = d3.timeDay.offset(startMonday, i); 
        
        // CORRECCIÓN DE ZONA HORARIA/AGENDA: Usar d3.timeFormat para obtener la fecha local (YYYY-MM-DD)
        const dateStr = d3.timeFormat("%Y-%m-%d")(date); 

        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-column';
        
        const dayHeader = document.createElement('h3');
        // date.getDay() seguirá devolviendo el índice correcto (1 para Lun, 0 para Dom)
        dayHeader.textContent = `> ${DAYS_OF_WEEK[date.getDay()]} (${date.getDate()}/${date.getMonth() + 1})`; 
        dayDiv.appendChild(dayHeader);

        const tasksForThisDay = allTasks.filter(task => {
            // La comparación ahora es entre la fecha local de la columna y la fecha local de la tarea
            return d3.timeFormat("%Y-%m-%d")(new Date(task.due_date)) === dateStr;
        });
        
        tasksForThisDay.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

        let taskIndex = 1;
        tasksForThisDay.forEach(task => {
            const taskItem = document.createElement('div');
            
            // Construir el texto completo para el desplegable (incluye hora y descripción)
            const time = new Date(task.due_date).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});
            const fullDetails = `[${time}] ${task.title}${task.description ? ' - ' + task.description : ''}`;
            
            // El contenido visible es solo el índice
            taskItem.className = 'task-item';
            taskItem.innerHTML = `<span>${taskIndex++}</span>`; 
            
            // Contenedor para el desplegable (oculto por defecto)
            const detailContainer = document.createElement('div');
            detailContainer.className = 'task-detail-expanded';
            detailContainer.textContent = fullDetails;
            detailContainer.style.display = 'none'; // Oculto inicialmente

            // Lógica de click para mostrar/ocultar los detalles
            taskItem.onclick = (e) => {
                // Previene que el clic active el doble clic de edición
                e.stopPropagation(); 
                
                // Si ya está visible, ocultar; si está oculto, mostrar
                if (detailContainer.style.display === 'none') {
                    // Ocultar todos los desplegables abiertos en este día ANTES de mostrar el nuevo
                    dayDiv.querySelectorAll('.task-detail-expanded').forEach(d => d.style.display = 'none');
                    detailContainer.style.display = 'block';
                } else {
                    detailContainer.style.display = 'none';
                }
            };
            
            // Lógica de doble click para la edición (Pasa al formulario)
            taskItem.ondblclick = () => editTask(task);


            // **BOTÓN DE ELIMINAR REMOVIDO**
            
            dayDiv.appendChild(taskItem);
            dayDiv.appendChild(detailContainer); // Añadir el contenedor del desplegable
        });

        viewContainer.appendChild(dayDiv);
    }
}


// -------------------------------------------------------------
// 6. UTILIDADES
// -------------------------------------------------------------

function groupTasksByWeek(tasks) {
    const grouped = {};
    tasks.forEach(task => {
        const date = new Date(task.due_date);
        // d3.timeWeek.count cuenta las semanas desde el inicio del año (0-52)
        const weekNumber = d3.timeWeek.count(d3.timeYear(date), date); 
        
        if (!grouped[weekNumber]) {
            grouped[weekNumber] = [];
        }
        grouped[weekNumber].push(task);
    });
    return grouped;
}