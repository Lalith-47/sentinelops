
import os
import time
from pathlib import Path

import psutil
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

API_URL = os.getenv(
    "SENTINELOPS_API_URL",
    "http://127.0.0.1:3000/metrics",
)

INTERVAL_SECONDS = 0


def collect_metrics() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "cpu_percent": psutil.cpu_percent(interval=0.2),
        "memory_percent": memory.percent,
        "disk_percent": disk.percent,
    }


def send_metrics(metrics: dict) -> None:
    response = requests.post(
        API_URL,
        json=metrics,
        timeout=5,
    )

    response.raise_for_status()
    print(f"Metrics sent successfully: {metrics}")


def main() -> None:
    print(f"SentinelOps agent started. Sending to {API_URL}")

    while True:
        try:
            metrics = collect_metrics()
            send_metrics(metrics)
        except requests.RequestException as error:
            print(f"Failed to send metrics: {error}")
        except Exception as error:
            print(f"Unexpected monitoring error: {error}")

        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
