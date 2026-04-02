#include <iostream>
#include <string>

class Calculator {
private:
    double result;
    
public:
    Calculator() : result(0.0) {}
    
    double add(double a, double b) {
        return a + b;
    }
    
    double subtract(double a, double b) {
        return a - b;
    }
    
    double multiply(double a, double b) {
        return a * b;
    }
    
    double divide(double a, double b) {
        if (b == 0) {
            throw std::runtime_error("Division by zero");
        }
        return a / b;
    }
};

void processData(int* data, int size) {
    for (int i = 0; i < size; i++) {
        data[i] *= 2;
    }
}

template<typename T>
T maxValue(T a, T b) {
    return (a > b) ? a : b;
}

int main() {
    Calculator calc;
    
    double sum = calc.add(5.0, 3.0);
    std::cout << "Sum: " << sum << std::endl;
    
    double product = calc.multiply(4.0, 2.5);
    std::cout << "Product: " << product << std::endl;
    
    int values[] = {1, 2, 3, 4, 5};
    processData(values, 5);
    
    int max = maxValue(10, 20);
    std::cout << "Max: " << max << std::endl;
    
    return 0;
}
