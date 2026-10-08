FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080 APP_ENV=production
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home labclear
COPY config.py main.py ./
COPY services ./services
COPY routers ./routers
COPY templates ./templates
COPY static ./static
COPY business_data ./business_data
COPY knowledge ./knowledge
COPY runtime_skills ./runtime_skills
COPY examples ./examples
COPY scripts/run_business.py scripts/container_start.py ./scripts/
RUN chown -R labclear:labclear /app
USER labclear
EXPOSE 8080
CMD ["python", "scripts/container_start.py"]
