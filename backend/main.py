# backend/main.py
import os
import uuid 
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
# Importar text, Integer y ProgrammingError para la migración
from sqlalchemy import Column, String, Boolean, DateTime, select, update, delete, Integer, text 
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.exc import ProgrammingError # Para manejar la excepción de columna inexistente
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# 1. Cargar variables de entorno
# FIX 1: Cargar el archivo .env de forma robusta usando la ruta absoluta
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in backend/.env. Please provide the Supabase PostgreSQL URI.")

# Asegura que la URL incluye el driver asíncrono (asyncpg)
if 'asyncpg' not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')

PORT = int(os.getenv("PORT", 8000))

# 2. Configuración de la Base de Datos (SQLAlchemy)
Base = declarative_base() 

engine: AsyncEngine = create_async_engine(DATABASE_URL, echo=True)

AsyncSessionLocal = async_sessionmaker(
    engine, 
    autocommit=False, 
    autoflush=False, 
    expire_on_commit=False
)

# Modelo de la base de datos (Supabase 'tasks' table)
class Task(Base):
    __tablename__ = 'tasks'
    id = Column(PG_UUID, primary_key=True) 
    title = Column(String, index=True)
    description = Column(String)
    due_date = Column(DateTime(timezone=True))
    is_completed = Column(Boolean, default=False)
    # Columna 'year' para el filtrado. Nullable=True para registros antiguos.
    year = Column(Integer, default=datetime.utcnow().year, nullable=True) 

# 3. Modelos Pydantic para la API
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    is_completed: bool = False

class TaskCreate(TaskBase):
    pass

class TaskResponse(TaskBase):
    # FIX 2: Usar uuid.UUID para evitar el ResponseValidationError
    id: uuid.UUID 
    year: Optional[int] = None # Hacer el año opcional en la respuesta
    model_config = ConfigDict(from_attributes=True) 

# 4. Inicialización de FastAPI
app = FastAPI(title="Planficador de Tareas 2025-26") # Título corregido

# Configurar CORS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Función para asegurar que la tabla existe Y aplicar la migración si es necesaria
async def create_db_and_tables():
    # 1. PASO AISLADO: Creación/Migración de Esquema (ALTER TABLE)
    # Esto debe ir fuera de la transacción principal para evitar el error de aborto.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        try:
            # Si la columna no existe, se añade.
            await conn.execute(
                text("ALTER TABLE tasks ADD COLUMN year INTEGER")
            )
            print("--- MIGRACIÓN: Columna 'year' añadida exitosamente. ---")
            
        except ProgrammingError as e:
            # Captura el error si la columna ya existe, lo cual es esperado y benigno.
            if "already exists" in str(e):
                print("--- MIGRACIÓN: Columna 'year' ya existe. (Ignorado) ---")
            else:
                # Si es cualquier otro error de programación, lo relanzamos.
                raise e
        except Exception as e:
             # Capturar cualquier otro error durante el esquema.
             print(f"--- MIGRACIÓN FALLIDA (ERROR GENERAL): {e} ---")

    # 2. PASO DE ACTUALIZACIÓN DE DATOS: Usar una NUEVA transacción para UPDATE
    # Este paso es seguro porque la migración de esquema ya se completó o falló de forma aislada.
    async with engine.begin() as conn:
        # Llenar los valores nulos de las tareas antiguas con el año 2025
        await conn.execute(
            text("UPDATE tasks SET year = EXTRACT(YEAR FROM due_date) WHERE year IS NULL") # Usa due_date para ser más preciso
        )
        print("--- MIGRACIÓN DE DATOS: Valores 'year' nulos actualizados. ---")


@app.on_event("startup")
async def startup_event():
    await create_db_and_tables()


# 5. Endpoints CRUD
@app.get("/api/tasks", response_model=List[TaskResponse])
async def read_tasks():
    # Obtiene TODAS las tareas, incluyendo las de 2025 (para el historial)
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Task).order_by(Task.due_date))
        tasks = result.scalars().all()
        return tasks

@app.post("/api/tasks", response_model=TaskResponse, status_code=201)
async def create_task(task: 'TaskCreate'): # FIX: Usar string literal para la referencia adelantada
    async with AsyncSessionLocal() as session:
        # Asigna el año automáticamente basado en la fecha de vencimiento
        task_year = task.due_date.year 
        
        new_task = Task(**task.model_dump(), id=str(uuid.uuid4()), year=task_year)
        session.add(new_task)
        await session.commit()
        await session.refresh(new_task)
        return new_task

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, task: 'TaskCreate'): # FIX: Usar string literal para la referencia adelantada
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        db_task = result.scalars().first()
        if db_task is None:
            raise HTTPException(status_code=404, detail="Task not found")

        update_data = task.model_dump(exclude_unset=True)
        
        # Si due_date es actualizado, actualiza el año de la tarea
        if 'due_date' in update_data:
            update_data['year'] = update_data['due_date'].year

        for key, value in update_data.items():
            setattr(db_task, key, value)

        await session.commit()
        await session.refresh(db_task)
        return db_task

@app.delete("/api/tasks/{task_id}", status_code=204)
async def delete_task(task_id: str):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Task).where(Task.id == task_id))
        db_task = result.scalars().first()

        if db_task is None:
            raise HTTPException(status_code=404, detail="Task not found")

        await session.delete(db_task)
        await session.commit()
        return {"ok": True}

# 6. Servir archivos estáticos del frontend
# FIX 3: Usar una ruta absoluta para el directorio frontend para evitar el RuntimeError en Uvicorn/Windows
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")