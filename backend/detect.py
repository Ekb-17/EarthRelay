"""CPU object detection for EarthRelay case intake."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(__file__).resolve().parent

MODEL_CANDIDATES = [
    ROOT / "yolo11n_openvino_model",
    ROOT / "yolo11n.pt",
    ROOT / "yolo11n.onnx",
    BACKEND / "yolo11n.pt",
]

# COCO labels that can support an environmental investigation.
# Household electronics and furniture are not treated as dumped e-waste.
CASE_HINTS = {
    "person": "people on site",
    "bicycle": "access / activity",
    "car": "vehicle on site",
    "motorcycle": "vehicle on site",
    "bus": "heavy vehicle",
    "truck": "possible haul / dump vehicle",
    "boat": "waterway activity",
    "bird": "wildlife",
    "cat": "animal present",
    "dog": "animal present",
    "horse": "livestock",
    "sheep": "livestock",
    "cow": "livestock",
    "elephant": "wildlife",
    "bear": "wildlife",
    "zebra": "wildlife",
    "giraffe": "wildlife",
    "backpack": "human presence",
    "handbag": "human presence",
    "suitcase": "possible dumped goods",
    "bottle": "possible waste if clustered outdoors",
    "cup": "indoor / household object",
    "bowl": "indoor / household object",
    "chair": "indoor / household object",
    "couch": "indoor / household object",
    "potted plant": "indoor / household object",
    "bed": "indoor / household object",
    "tv": "indoor / household object",
    "laptop": "indoor / household object",
    "cell phone": "indoor / household object",
    "keyboard": "indoor / household object",
    "mouse": "indoor / household object",
    "remote": "indoor / household object",
    "microwave": "indoor / household object",
    "oven": "indoor / household object",
    "toaster": "indoor / household object",
    "refrigerator": "indoor / household object",
    "sink": "indoor / household object",
    "book": "indoor / household object",
    "vase": "indoor / household object",
    "scissors": "indoor / household object",
    "teddy bear": "indoor / household object",
    "hair drier": "indoor / household object",
    "toothbrush": "indoor / household object",
    "fire hydrant": "urban infrastructure",
    "stop sign": "roadside scene",
    "parking meter": "urban infrastructure",
    "bench": "public site",
    "traffic light": "roadside scene",
}


def resolve_model_path() -> Path:
    for path in MODEL_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError(
        "No YOLO model found. Expected yolo11n.pt or yolo11n_openvino_model at the project root."
    )


@lru_cache(maxsize=1)
def get_model():
    from ultralytics import YOLO

    last_error = None
    for path in MODEL_CANDIDATES:
        if not path.exists():
            continue
        try:
            return YOLO(str(path)), str(path)
        except Exception as exc:
            last_error = exc
    try:
        model = YOLO("yolo11n.pt")
        return model, "yolo11n.pt"
    except Exception as exc:
        last_error = exc
    raise FileNotFoundError(last_error or "No loadable YOLO model found.")


def detect_image(image_path: Path, annotated_path: Path) -> dict:
    model, model_path = get_model()
    results = model.predict(
        source=str(image_path),
        device="cpu",
        imgsz=640,
        conf=0.4,
        verbose=False,
    )
    result = results[0]
    plotted = result.plot()
    Image.fromarray(plotted[:, :, ::-1]).save(annotated_path)

    detections = []
    names = result.names or {}
    boxes = result.boxes
    if boxes is not None:
        for box in boxes:
            cls_id = int(box.cls[0])
            label = names.get(cls_id, str(cls_id))
            conf = float(box.conf[0])
            xyxy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
            detections.append(
                {
                    "label": label,
                    "confidence": round(conf, 3),
                    "box": xyxy,
                    "hint": CASE_HINTS.get(label, "scene object"),
                }
            )

    labels = [item["label"] for item in detections]
    hints = sorted({item["hint"] for item in detections})
    return {
        "model": Path(model_path).name,
        "device": "cpu",
        "count": len(detections),
        "detections": detections,
        "labels": labels,
        "hints": hints,
        "summary": _summary(labels, hints),
    }


def _summary(labels: list[str], hints: list[str]) -> str:
    indoor = {
        "laptop",
        "tv",
        "cell phone",
        "keyboard",
        "mouse",
        "remote",
        "microwave",
        "oven",
        "toaster",
        "refrigerator",
        "sink",
        "toilet",
        "couch",
        "bed",
        "chair",
        "dining table",
        "book",
        "clock",
        "vase",
        "cup",
        "bowl",
        "potted plant",
    }
    if not labels:
        return "No objects detected above confidence threshold. Review the photo manually."
    if labels and all(label in indoor or label in {"person"} for label in labels):
        top = ", ".join(sorted(set(labels))[:8])
        return f"Detected indoor / ordinary objects ({top}). Not scored as a field environmental incident."
    top = ", ".join(sorted(set(labels))[:8])
    useful_hints = [hint for hint in hints if "household" not in hint]
    hint_text = "; ".join(useful_hints[:4])
    if hint_text:
        return f"Detected {len(labels)} object(s): {top}. Investigation hints: {hint_text}."
    return f"Detected {len(labels)} object(s): {top}."
