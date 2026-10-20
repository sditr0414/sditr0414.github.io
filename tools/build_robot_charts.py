"""Build portfolio charts from the recorded SO-101 comparison results.

Usage: python3 tools/build_robot_charts.py /path/to/Final_Arm
Only reads experiment results; never starts training or connects to equipment.
"""
import json
import sys
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
    plt.close(fig)


base = "SO101_synthetic/benchmarks/"
nine = base + "yolo26s_9way_20261016/results/"
variants = {k: read(nine + k + ".json") for k in
            ["real_fp16", "mixed_original", "mixed_fp16", "mixed_int8"]}
mask = lambda d: d["domains"]["real"]["metrics"]["metrics/mAP50-95(M)"] * 100
s_training = [mask(variants[k]) for k in ["real_fp16", "mixed_fp16"]]
xbase = base + "yolo26x_seg_vs_sam3_20261017/comparison/"
x_training = [read(xbase + k + "/test/metrics_summary.json")["dedup"]["mask"]["mask_ap50_95"] * 100
              for k in ["yolo_trt_fp16", "yolo_synthetic_then_real_uncapped_fp16"]]
bars("robot-training-s", ["실물만", "혼합"], s_training, 100, "실물 테스트 마스크 mAP50–95 · 높을수록 좋음")
bars("robot-training-x", ["혼합", "순차"], x_training, 100, "실물 테스트 마스크 AP50–95 · 높을수록 좋음", highlight=0)
quant_keys = ["mixed_original", "mixed_fp16", "mixed_int8"]
quant_time = [variants[k]["pi"]["total_ms_median"] / 1000 for k in quant_keys]
bars("robot-quantization", ["원본", "FP16", "INT8 혼합"], quant_time, 5,
     "Pi 5 처리 시간 중앙값 · 초 · 짧을수록 좋음", 3, highlight=1)
sizes = read(base + "yolo26n_vs_s_mixed_fp16_20261018/comparison.json")
size_times = [sizes["pi"][k]["pipeline_ms_median"] / 1000 for k in ["s", "n"]]
bars("robot-model-size", ["YOLO26s", "YOLO26n"], size_times, 1.2,
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
    "date": "2026-10-21",
    "training_s": {"model": "YOLO26s, NCNN FP16", "values": s_training,
                   "source": nine, "metric": "Ultralytics mask mAP50-95"},
    "training_x": {"model": "YOLO26x, TensorRT FP16", "values": x_training,
                   "source": xbase, "metric": "recorded common-protocol mask AP50-95"},
    "quantization": [{"variant": k, "mask_map": mask(variants[k]), "seconds": quant_time[i]}
                     for i, k in enumerate(quant_keys)],
    "size": {k: {"seconds": sizes["pi"][k]["pipeline_ms_median"] / 1000,
                 "mask_map": mask(sizes["accuracy"][k])} for k in ["s", "n"]},
    "pallet_yield": yield_values,
    "limitations": [
        "Training comparisons use separate model/runtime/evaluation protocols; do not rank across the two panels.",
        "Model test: 31 real photos, one captured environment; AP is not simple accuracy.",
        "Pi timings exclude camera, transport, UI and robot motion.",
        "Jig comparison includes all 304 development photos, including train/val/test; not unseen-test accuracy."
    ]
}
(output / "robot-evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
print("Wrote five charts and their source values to", output)
