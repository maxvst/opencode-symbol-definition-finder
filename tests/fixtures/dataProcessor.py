from typing import List, Optional
import json

class DataProcessor:
    def __init__(self, name: str):
        self.name = name
        self.data: List[dict] = []
    
    def process_item(self, item: dict) -> dict:
        processed = {
            'id': item.get('id'),
            'value': item.get('value', 0) * 2,
            'processed_by': self.name
        }
        return processed
    
    def batch_process(self, items: List[dict]) -> List[dict]:
        return [self.process_item(item) for item in items]
    
    def load_from_file(self, filepath: str) -> None:
        with open(filepath, 'r') as f:
            self.data = json.load(f)

def analyze_data(data: List[dict]) -> Optional[dict]:
    if not data:
        return None
    
    total = sum(item.get('value', 0) for item in data)
    count = len(data)
    
    return {
        'total': total,
        'count': count,
        'average': total / count if count > 0 else 0
    }

def validate_input(data: dict) -> bool:
    required_fields = ['id', 'value']
    return all(field in data for field in required_fields)

# Main execution
if __name__ == '__main__':
    processor = DataProcessor('MainProcessor')
    
    test_data = [
        {'id': 1, 'value': 10},
        {'id': 2, 'value': 20},
        {'id': 3, 'value': 30}
    ]
    
    result = processor.batch_process(test_data)
    analysis = analyze_data(result)
    
    print(f"Analysis: {analysis}")
