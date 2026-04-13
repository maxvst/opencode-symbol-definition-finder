CXX ?= g++
CXXFLAGS = -std=c++17 -Wall

SRC_B = B/b.cpp
SRC_C = C/c.cpp
TARGET = program

all: $(TARGET)

$(TARGET): $(SRC_B) $(SRC_C)
	$(CXX) $(CXXFLAGS) -I$(realpath C) -o $@ $^

clean:
	rm -f $(TARGET)

.PHONY: all clean
