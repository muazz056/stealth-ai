#!/bin/bash

echo "========================================"
echo " Interview Stealth Assist - Builder"
echo "========================================"
echo ""

show_menu() {
    echo "Choose build option:"
    echo "[1] Build for Windows only"
    echo "[2] Build for macOS only"
    echo "[3] Build for Linux only"
    echo "[4] Build for ALL platforms"
    echo "[5] Just build frontend (no packaging)"
    echo "[0] Exit"
    echo ""
    read -p "Enter your choice (0-5): " choice
    echo ""
}

while true; do
    show_menu
    case $choice in
        1)
            echo "Building for Windows..."
            npm run dist:win
            ;;
        2)
            echo "Building for macOS..."
            echo "Note: This requires a Mac computer!"
            npm run dist:mac
            ;;
        3)
            echo "Building for Linux..."
            npm run dist:linux
            ;;
        4)
            echo "Building for ALL platforms..."
            echo "Note: Cross-platform building may require additional setup!"
            npm run dist:all
            ;;
        5)
            echo "Building frontend only..."
            npm run build
            ;;
        0)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid choice! Please try again."
            echo ""
            continue
            ;;
    esac
    
    echo ""
    echo "========================================"
    echo "Build completed!"
    echo "Check the 'dist-electron' folder for your executable."
    echo "========================================"
    echo ""
    
    read -p "Press Enter to continue or Ctrl+C to exit..."
done

