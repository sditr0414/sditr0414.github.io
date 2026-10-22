"""Build portfolio charts from the recorded SO-101 comparison results.

Usage: python3 tools/build_robot_charts.py /path/to/Final_Arm
Add --evidence-only to refresh source values without regenerating SVG files.
Add --current-only to regenerate only the three current candidate charts.
Only reads experiment results; never starts training or connects to equipment.
"""
import json
import sys
from statistics import mean, pstdev
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

source = Path(sys.argv[1])
output = Path(__file__).resolve().parents[1] / "docs/assets/charts"
output.mkdir(parents=True, exist_ok=True)
font = FontProperties(fname="/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
plt.rcParams.update({"svg.fonttype": "path", "axes.unicode_minus": False})
ink, muted, blue, pale = "#203b52", "#566777", "#315e80", "#a4bdd1"


def read(path):
    return json.loads((source / path).read_text())


def bars(name, labels, values, maximum, unit, decimals=2, highlight=None):
    if "--evidence-only" in sys.argv[2:] or ("--current-only" in sys.argv[2:] and name not in {"robot-training-n-sequential", "robot-quantization", "robot-model-size"}):
        return
    fig, ax = plt.subplots(figsize=(6.4, 2.4 if len(labels) == 2 else 3.0))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")
    colors = [blue if i == highlight else pale for i in range(len(labels))]
    ax.barh(range(len(labels)), values, height=.46, color=colors)
    ax.set_yticks(range(len(labels)), labels, fontproperties=font, fontsize=18, color=ink)
    ax.invert_yaxis()
    ax.set_xlim(0, maximum * 1.16)
    ax.set_xticks([0, maximum / 2, maximum])
    ax.set_xticklabels([f"{x:g}" for x in [0, maximum / 2, maximum]], fontsize=15, color=muted)
    ax.grid(axis="x", color="#dce4eb", linewidth=.65)
    ax.set_axisbelow(True)
    ax.tick_params(axis="both", length=0, pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, value in enumerate(values):
        ax.text(value + maximum * .025, i, f"{value:.{decimals}f}",
                va="center", fontproperties=font, fontsize=19, color=ink)
    fig.subplots_adjust(left=.27, right=.97, top=.94, bottom=.22)
    fig.savefig(output / f"{name}.svg", transparent=True, metadata={"Date": None})
    svg_path = output / f"{name}.svg"
    svg_path.write_text("\n".join(line.rstrip() for line in svg_path.read_text().splitlines()) + "\n")
    plt.close(fig)


base = "SO101_synthetic/benchmarks/"
comparison_base = base + "portfolio_confidence75_final_20261022/"
operating = read(comparison_base + "accuracy_complete.json")
performance = read(comparison_base + "performance_complete.json")
training = {k: operating[k] for k in ["n_real", "n_mixed", "n_sequential"]}
quant_models = {"original": "n_original", "fp16": "n_sequential", "int8": "n_int8"}
quantization = {"variants": {k: operating[v] for k, v in quant_models.items()},
                "pi": {k: performance[v] for k, v in quant_models.items()}}
mask = lambda d: d["overall"]["class_mean_iou"] * 100
training_values = {k: mask(v) for k, v in training.items()}
class_scores = {k: {label: score * 100 for label, score in {label: row["mean_iou"] for label, row in v["per_class"].items()}.items()}
                for k, v in training.items()}
class_summary = {k: {"mean": mean(scores.values()), "minimum": min(scores.values()),
                     "population_stddev": pstdev(scores.values())}
                 for k, scores in class_scores.items()}
assert all(scores.keys() == class_scores["n_real"].keys() for scores in class_scores.values())
bars("robot-training-n-sequential", ["혼합", "순차"],
     [training_values[k] for k in ["n_mixed", "n_sequential"]], 100,
     "원본 마스크 클래스 평균 IoU · % · 높을수록 좋음", highlight=1)
quant_keys = ["original", "fp16", "int8"]
quant_time = [quantization["pi"][k]["seconds"] for k in quant_keys]
bars("robot-quantization", ["원본", "FP16", "INT8 혼합"], quant_time, 2,
     "Pi 5 처리 시간 중앙값 · 초 · 짧을수록 좋음", 3, highlight=1)
sizes = read(base + "yolo26n_vs_s_mixed_fp16_20261018/comparison.json")
current_sizes = json.loads((output / "robot-size-current-evidence.json").read_text())["models"]
size_times = [current_sizes[k]["seconds"] for k in ["s", "n"]]
bars("robot-model-size", ["YOLO26s", "YOLO26n"], size_times, 1.5,
     "Pi 5 처리 시간 중앙값 · 초 · 짧을수록 좋음", 3, highlight=1)
full = read("SO101_teach/verification/full-vision-revised-20261020/summary.json")
jigs = full["hosts"]["pi"]["jig"]
keys = list(jigs)
cad_key = next(k for k in keys if k not in ["opencv", "ai_cv"])
yield_values = [jigs[k]["targets"]["pallet"]["roi_yield"] * 100
                for k in ["opencv", "ai_cv", cad_key]]
bars("robot-pallet-yield", ["OpenCV", "AI + OpenCV", "AI + CAD"], yield_values, 100,
     "저장 사진에서 팔레트 위치 확보율 · %", 1, highlight=2)
evidence = {
    "date": "2026-10-22",
    "training_n": {"model": "YOLO26n, NCNN FP16", "values": training_values,
                   "scores": class_scores, "summary": class_summary,
                   "source": comparison_base + "accuracy_complete.json",
                   "metric": "Original-resolution mask IoU, macro average over classes, confidence 0.75; unmatched GT contributes zero",
                   "protocol": "Same training settings and early stopping per stage; sequential trains synthetic then real; actual epochs and total training exposure may differ.",
                   "model_hashes": {k: v["model_sha256"] for k, v in training.items()}},
    "quantization": [{"variant": k, "model": "YOLO26n sequential", "class_mean_iou_percent": mask(quantization["variants"][k]),
                      "seconds": quant_time[i], "runs": quantization["pi"][k]["runs"],
                      "source": comparison_base + "performance_complete.json",
                      "model_hashes": quantization["variants"][k]["model_sha256"]}
                     for i, k in enumerate(quant_keys)],
    "size": {k: {field: current_sizes[k][field] for field in ["seconds", "class_mean_iou_percent", "peak_rss_mib", "parameters", "training"]}
             for k in ["s", "n"]},
    "pallet_yield": yield_values,
    "operating_evaluation": {"protocol": read(comparison_base + "protocol.json"),
                             "variants": {k: {"overall": v["overall"], "model_sha256": v["model_sha256"]} for k, v in operating.items()}},
    "limitations": [
        "Training panels use the same nano model and NCNN FP16 evaluation; early-stopping criteria match, but stage counts and total training duration differ.",
        "Operating-point mask evaluation on Raspberry Pi 5: 31 real photos, confidence 0.75, original 1280x720 masks; class-average IoU includes zero for unmatched ground truth. FP/FN reported separately.",
        "Final candidates use sequential nano and mixed small training; the size panel compares the actual candidates, not an isolated architecture-only experiment. Parameters are counted after inference fusion.",
        "Pi timings exclude camera, transport, UI and robot motion.",
        "Jig comparison includes all 304 development photos, including train/val/test; not unseen-test accuracy."
    ]
}
# Historical 2026-10-21 deployment comparison uses matched-mask IoU, not mAP.
final_path = base + "yolo26n_mixed_75_25_20261021/boundary_repair_20261021/ncnn_comparison/report.json"
final_report = read(final_path)
final_metrics = {}
for host in ["pc", "pi"]:
    data = final_report["hosts"][host]
    final_metrics[host] = {
        variant: {
            "accuracy": {key: value for key, value in data["accuracy"]["0.5"][variant].items()
                         if not isinstance(value, (list, dict))},
            "performance": data["performance"][variant]
        } for variant in ["current", "final"]
    }
bars("robot-final-iou", ["기존", "최종"],
     [final_metrics["pi"][v]["accuracy"]["mean_iou"] * 100 for v in ["current", "final"]],
     100, "마스크 평균 IoU · %", highlight=1)
evidence["final_model_20261021"] = {
    "model": "YOLO26n-seg boundary repair, NCNN FP16, input 960, threads 4",
    "source": final_path,
    "confidence": 0.5,
    "metrics": final_metrics,
    "dataset": {k: v for k, v in read("SO101_synthetic/mixed_process_75_25_20261021/mix_plan.json").items()
                if k.endswith("counts") or k.endswith("fraction") or k.startswith("total_") or k == "synthetic_categories"},
    "timing_scope": "Pi roundtrip includes SSH and PNG transport, excludes camera and GUI; PC has a different worker transport path."
}
(output / "robot-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
print("Wrote source values" if "--evidence-only" in sys.argv[2:] else "Wrote charts and source values", "to", output)
