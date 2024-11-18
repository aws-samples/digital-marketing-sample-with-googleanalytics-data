FROM public.ecr.aws/docker/library/python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY . .
RUN pip install -r requirements.txt
ENTRYPOINT ["python", "pinpoint.py"]