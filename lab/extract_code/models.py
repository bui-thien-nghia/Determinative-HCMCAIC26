import torch
import torch.nn.functional as F
import cv2
from PIL import Image

# Standardized frame
class ExtractionModel:
    def __init__(self, name, device, quantized, attention_implementation):
        self.model = None
        self.processor = None
        self.name = name
        self.device = device
        self.quantized = quantized
        self.attention_implementation = attention_implementation

    # Placeholders
    def load(self):
        print(f"[INFO] Loading {"quantized" if self.quantized else "full"} {self.name}")
        print(f"[INFO] {self.name} is on {self.device} device")

    
    def run(self, input, batch_size):
        pass

# SigLIP2
from transformers import AutoModel, AutoProcessor

class SigLIP2Model(ExtractionModel):
    def __init__(self, name, device="default", quantized=True, attention_implementation=None):
        super().__init__(name, device, quantized, attention_implementation)
        
    
    def load(self):
        super().load()
        self.model = AutoModel.from_pretrained(
            self.name,
            device_map="auto",
            dtype=torch.bfloat16 if self.quantized else torch.float32,
            attn_implementation=self.attention_implementation
        ).eval()
        if self.device != "default":
            self.model = self.model.to(self.device)
        self.device = str(self.model.device)
        self.processor = AutoProcessor.from_pretrained(self.name)


    def run(self, imgs: list[Image.Image], batch_size: int = 32):
        if not self.model or not self.processor:
            print(f"[ERROR] Cannot run inference on {self.name}: either the model or the processor is missing")
            return None
        feats = []
        for i in range(0, len(imgs), batch_size):
            j = len(imgs) if i + batch_size > len(imgs) else i + batch_size
            batch = imgs[i:j]
            preprocs = self.processor(images=batch, return_tensors='pt')
            
            with torch.no_grad():
                feat = self.model.get_image_features(**preprocs.to(self.device)).pooler_output
                feat = F.normalize(feat)

            feats.append(feat.cpu())
        return torch.vstack(feats).float().numpy()
    
    

# BGE M3
from FlagEmbedding import BGEM3FlagModel

class BGEM3Model(ExtractionModel):
    def __init__(self, name, device="default", quantized=True, attention_implementation=None):
        super().__init__(name, device, quantized, attention_implementation)
        
    
    def load(self, return_dense=False, return_sparse=True, return_colbert=False):
        super().load()
        if self.device == "default": self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = BGEM3FlagModel(
            self.name,
            normalize_embeddings=True,
            use_bf16=self.quantized,
            devices=self.device,
            return_dense=return_dense,
            return_sparse=return_sparse,
            return_colbert_vecs=return_colbert,
            model_kwargs={"attn_implementation": self.attention_implementation}
        )


    def run(self, txts: list[str], batch_size: int = 32):
        if not self.model:
            print(f"[ERROR] Cannot run inference on {self.name}: the model is missing")
            return None
        feat_dicts = self.model.encode(
            txts,
            batch_size=batch_size
        )
        return feat_dicts["dense_vecs"], feat_dicts["lexical_weights"], feat_dicts["colbert_vecs"]

# TransNetV2
from transnetv2_pytorch import TransNetV2

class TransNetV2Model(ExtractionModel):
    def __init__(self, name="Sn4kehead/TransNetV2", device="default", quantized=True, attention_implementation=None):
        super().__init__(name, device, quantized, attention_implementation)
        
    
    def load(self):
        super().load()
        self.model = TransNetV2(device="auto" if self.device == "default" else self.device).eval()
        self.device = str(self.model.device)
        # if not self.quantized: return
        # self.model = self.model.to(dtype=torch.float16)


    def run(self, vid_path: str, confidence_threshold: float = 0.5):
        if not self.model:
            print(f"[ERROR] Cannot run inference on {self.name}: the model is missing")
            return None

        imgs = []
        maps = []
        with torch.no_grad():
            with torch.amp.autocast(self.device, dtype=torch.float32 if not self.quantized else torch.float16):
                scenes = self.model.detect_scenes(vid_path, threshold=confidence_threshold)

        cap = cv2.VideoCapture(vid_path)
        if not cap: return []
        for scene in scenes:
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_order = scene["start_frame"] + fps // 2
            time_order = frame_order / fps
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_order)
            ret, frame = cap.read()
            if not ret: continue

            imgs.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
            maps.append({
                "frame_order": frame_order,
                "time_order": time_order,
                "fps": fps,
            })

        return imgs, maps


class FasterWhisperModel(ExtractionModel):
    pass


class RTDETRModel(ExtractionModel):
    pass