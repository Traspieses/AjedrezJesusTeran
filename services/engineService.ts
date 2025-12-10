import { EngineAnalysis } from '../types.ts';

type EngineMessage = {
  topic: 'init' | 'move' | 'analysis' | 'ready';
  payload?: any;
};

class StockfishService {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private onAnalysisCallback: ((analysis: EngineAnalysis) => void) | null = null;
  private messageQueue: string[] = [];

  async init(): Promise<boolean> {
    if (this.worker) return true;

    const STOCKFISH_URLS = [
      'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js',
      'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'
    ];

    for (const url of STOCKFISH_URLS) {
      try {
        console.log(`Attempting to load Stockfish from: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        
        const script = await response.text();
        
        // Basic check to ensure we didn't get HTML (404 page)
        if (script.trim().startsWith('<')) {
          throw new Error("Received HTML instead of JS");
        }

        const blob = new Blob([script], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);

        this.worker = new Worker(workerUrl);

        this.worker.onmessage = (e) => this.handleMessage(e.data);
        this.worker.onerror = (e) => console.error("Stockfish Worker Error:", e);
        
        // Initialize UCI mode
        this.post('uci');
        
        return new Promise((resolve) => {
          let attempts = 0;
          const checkReady = setInterval(() => {
            attempts++;
            if (this.isReady) {
              clearInterval(checkReady);
              console.log("Stockfish initialized successfully.");
              resolve(true);
            }
            if (attempts > 50) { // 5 seconds timeout
              clearInterval(checkReady);
              console.warn("Stockfish initialization timed out.");
              resolve(false);
            }
          }, 100);
        });
      } catch (error) {
        console.warn(`Failed to load Stockfish from ${url}:`, error);
        // Continue to next URL
      }
    }
    
    console.error("All Stockfish loading attempts failed.");
    return false;
  }

  private post(command: string) {
    if (this.worker) {
      this.worker.postMessage(command);
    } else {
      this.messageQueue.push(command);
    }
  }

  private handleMessage(line: string) {
    // console.log('Engine:', line); // Debug

    if (line === 'uciok') {
      this.isReady = true;
      // Process queued messages
      while (this.messageQueue.length > 0) {
        const cmd = this.messageQueue.shift();
        if (cmd) this.worker?.postMessage(cmd);
      }
    }

    if (line.startsWith('info depth') && line.includes('score')) {
      this.parseAnalysis(line);
    }
  }

  private parseAnalysis(line: string) {
    if (!this.onAnalysisCallback) return;

    // Parse Depth
    const depthMatch = line.match(/depth (\d+)/);
    const depth = depthMatch ? parseInt(depthMatch[1]) : 0;

    // Parse Score
    let score = 0;
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);

    if (mateMatch) {
      score = parseInt(mateMatch[1]) > 0 ? 10000 : -10000;
    } else if (cpMatch) {
      score = parseInt(cpMatch[1]);
    }

    // Parse Best Move (pv)
    const pvMatch = line.match(/ pv (.+)/);
    const pv = pvMatch ? pvMatch[1] : '';
    const bestMove = pv.split(' ')[0];

    this.onAnalysisCallback({
      bestMove,
      evaluation: score,
      depth,
      lines: [{ move: bestMove, score, pv }]
    });
  }

  evaluate(fen: string, depth: number = 15, onAnalysis: (data: EngineAnalysis) => void) {
    this.onAnalysisCallback = onAnalysis;
    this.post('stop');
    this.post(`position fen ${fen}`);
    this.post(`go depth ${depth}`);
  }

  stop() {
    this.post('stop');
  }
  
  quit() {
    this.post('quit');
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }
}

export const engine = new StockfishService();