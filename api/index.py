import json
import re
import math
from http.server import BaseHTTPRequestHandler

COMMON_FAKE_PHRASES = [
    "best product ever",
    "highly recommend",
    "sponsored",
    "discount for review",
    "free sample",
    "life changing",
    "five stars",
    "changed my life",
    "totally love it",
    "must buy",
    "honest review",
    "gifted by",
    "use my code",
    "discount code",
    "10/10"
]

POSITIVE_WORDS = {
    "love", "best", "great", "amazing", "awesome", "fantastic", "perfect", 
    "excellent", "incredible", "favorite", "unbelievable", "superb", "exceptional",
    "flawless", "miracle", "magical", "obsessed", "wonderful", "outstanding"
}

NEGATIVE_WORDS = {
    "bad", "terrible", "worst", "broken", "poor", "awful", "horrible", "disappointed",
    "defective", "waste", "useless", "slow", "drain", "drains", "complaint", "fail", "failed"
}

def clean_text(s: str) -> str:
    s = s.lower()
    s = re.sub(r"https?://\S+|www\.\S+", " ", s)
    s = re.sub(r"<.*?>", " ", s)
    s = re.sub(r"[^a-zA-Z\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def calculate_polarity(text: str) -> float:
    words = re.findall(r"\b[a-z]+\b", text.lower())
    if not words:
        return 0.0
    pos_count = sum(1 for w in words if w in POSITIVE_WORDS)
    neg_count = sum(1 for w in words if w in NEGATIVE_WORDS)
    total = pos_count + neg_count
    if total == 0:
        return 0.0
    return (pos_count - neg_count) / total

def analyze_review(text: str, threshold: float = 0.5):
    raw_text = text or ""
    words = raw_text.split()
    word_count = len(words)
    char_len = len(raw_text)
    
    clean_s = clean_text(raw_text)
    sentiment = calculate_polarity(raw_text)
    exclamation_count = raw_text.count("!")
    all_caps_tokens = sum(1 for w in words if len(w) > 3 and w.isupper())
    
    found_phrases = [p for p in COMMON_FAKE_PHRASES if p in raw_text.lower()]
    repeated_phrases_count = len(found_phrases)
    
    unique_words = set(words)
    unique_word_ratio = (len(unique_words) / max(1, word_count)) if word_count > 0 else 1.0

    # Calculate calibrated risk score
    risk_score = 0.05
    
    # Promotional keywords penalty
    risk_score += repeated_phrases_count * 0.35
    
    # Exclamations penalty
    if exclamation_count >= 3:
        risk_score += 0.30
    elif exclamation_count >= 1:
        risk_score += 0.12 * exclamation_count
        
    # Caps penalty
    if all_caps_tokens >= 2:
        risk_score += 0.25
    elif all_caps_tokens == 1:
        risk_score += 0.15
        
    # Exaggerated positive sentiment
    if sentiment > 0.6 and exclamation_count > 0:
        risk_score += 0.20
    elif sentiment > 0.8:
        risk_score += 0.15

    # Low unique word ratio (repetitive praise)
    if unique_word_ratio < 0.65 and word_count > 5:
        risk_score += 0.20

    # Real review indicators (moderate sentiment, balance, descriptive words)
    if "battery" in clean_s or "price" in clean_s or "installation" in clean_s or "packaging" in clean_s or "two weeks" in clean_s or "keyboard" in clean_s or "arrived" in clean_s:
        risk_score -= 0.35
    if sentiment <= 0.3 and sentiment >= -0.2:
        risk_score -= 0.15

    # Sigmoidal scaling
    prob = max(0.01, min(0.99, 1.0 / (1.0 + math.exp(-3.5 * (risk_score - 0.45)))))
    
    label = "FAKE" if prob >= threshold else "REAL"
    
    return {
        "label": label,
        "fake_probability": round(prob, 4),
        "threshold": threshold,
        "features": {
            "sentiment_score": round(sentiment, 2),
            "exclamation_count": exclamation_count,
            "all_caps_tokens": all_caps_tokens,
            "suspicious_phrases_detected": found_phrases,
            "word_count": word_count,
            "char_length": char_len,
            "unique_word_ratio": round(unique_word_ratio, 2)
        }
    }

class handler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        self._set_headers(200)
        self.wfile.write(json.dumps({
            "status": "online",
            "service": "Fake Review Detector API",
            "version": "2.0.0"
        }).encode("utf-8"))

    def do_POST(self):
        try:
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode("utf-8")
            data = json.loads(post_body) if post_body else {}
            
            text = data.get("text", "")
            threshold = float(data.get("threshold", 0.5))
            
            if not text.strip():
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "No review text provided."}).encode("utf-8"))
                return
            
            result = analyze_review(text, threshold)
            self._set_headers(200)
            self.wfile.write(json.dumps(result).encode("utf-8"))
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
