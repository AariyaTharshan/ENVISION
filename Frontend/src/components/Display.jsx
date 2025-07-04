import React, { useState, useRef, useEffect } from 'react';
import envisionLogo from '../assest/envision.png'; // Import the logo

const Display = ({ isRecording, imagePath, onImageLoad, selectedTool, shapes, onShapesUpdate, currentColor = '#00ff00', currentFontColor = '#ffffff', currentThickness = 2, onColorChange, onFontColorChange }) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const displayRef = useRef(null);
  const canvasRef = useRef(null);
  const prevImagePathRef = useRef(imagePath);
  const [scale, setScale] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);

  // Drawing state
  const [points, setPoints] = useState([]);
  const [curvePoints, setCurvePoints] = useState([]);

  // Resolution state with default values
  const [resolution, setResolution] = useState({ width: 1920, height: 1080 });

  // Add state for measurements display
  const [measurements, setMeasurements] = useState([]);

  // Add canvas context ref
  const ctxRef = useRef(null);

  // Add calibration state
  const [calibrationFactor, setCalibrationFactor] = useState(null); // microns/pixel

  // Add zoom state
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);

  // Add this near the top of the component with other state declarations
  const [calibrationScale, setCalibrationScale] = useState(''); // Store the scale text

  // Add these new states at the top of the component
  const [eraserRadius, setEraserRadius] = useState(15);

  // Add state for calibration
  const [currentCalibration, setCurrentCalibration] = useState(null);

  // Add default image state
  const [defaultImageLoaded, setDefaultImageLoaded] = useState(false);

  // Add these new states near the top with other state declarations
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPosition, setTextPosition] = useState(null);
  const textInputRef = useRef(null);

  // Add new state for move functionality
  const [selectedShape, setSelectedShape] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });

  // Add history state for undo/redo
  const [history, setHistory] = useState([shapes]); // Initialize with current shapes
  const [historyIndex, setHistoryIndex] = useState(0);

  // Initialize history when shapes prop changes
  useEffect(() => {
    // Only initialize if history is empty or if shapes have changed externally
    if (history.length === 0 || !history.some(state => state === shapes)) {
      setHistory([shapes]);
      setHistoryIndex(0);
    }
  }, [shapes]);

  // Add pointCounter state near the top with other state declarations
  const [pointCounter, setPointCounter] = useState(1);

  // Add at the top, after other state declarations:
  const [shapeIdCounter, setShapeIdCounter] = useState(1);

  // Load calibration data when component mounts
  useEffect(() => {
    const loadCalibration = () => {
      const savedSettings = localStorage.getItem('cameraSettings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          // Get calibration data for the selected magnification
          fetch(`http://localhost:5000/api/get-calibration?magnification=${settings.magnification}`)
            .then(response => response.json())
            .then(data => {
              if (data.status === 'success') {
                setCalibrationFactor(data.calibrationFactor); // microns/pixel
                // Set the scale text
                setCalibrationScale(`1 pixel = ${data.calibrationFactor.toFixed(3)} microns`);
              }
            })
            .catch(error => {
              console.error('Error loading calibration:', error);
            });
        } catch (error) {
          console.error('Error loading calibration:', error);
        }
      }
    };

    loadCalibration();
    window.addEventListener('storage', loadCalibration);
    return () => window.removeEventListener('storage', loadCalibration);
  }, []);

  // Set up canvas context when component mounts or resolution changes
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      
      // Set canvas size
      canvas.width = resolution.width;
      canvas.height = resolution.height;
      
      // Set up initial context styles
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'top';
    }
  }, [resolution]);

  // Update drawing function to use context ref
  useEffect(() => {
    if (ctxRef.current) {
      drawShapes(ctxRef.current);
    }
  }, [shapes, currentShape]);

  // Load camera settings for resolution
  useEffect(() => {
    const loadSettings = () => {
      const savedSettings = localStorage.getItem('cameraSettings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          const [width, height] = settings.resolution.split('x').map(Number);
          setResolution({ width, height });
          
          // Set canvas size to match resolution
          if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
          }
        } catch (error) {
          console.error('Error loading camera settings:', error);
        }
      }
    };

    loadSettings();
    window.addEventListener('storage', loadSettings);
    return () => window.removeEventListener('storage', loadSettings);
  }, []);

  // Handle zoom with mouse wheel
  const handleWheel = (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prevZoom => Math.min(Math.max(prevZoom * delta, 0.1), 5));
    }
  };

  // Update coordinate calculation for zoomed view
  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    return {
      x: ((e.pageX - rect.left - scrollLeft) * scaleX) / zoom,
      y: ((e.pageY - rect.top - scrollTop) * scaleY) / zoom
    };
  };

  // Update isPointInShape function with better detection
  const isPointInShape = (point, shape) => {
    const threshold = 10; // Increased threshold for better detection

    switch (shape.type) {
      case 'point': {
        const distance = Math.sqrt(
          Math.pow(point.x - shape.x, 2) + 
          Math.pow(point.y - shape.y, 2)
        );
        return distance <= threshold;
      }

      case 'line':
      case 'arrow': {
        const A = { x: shape.start.x, y: shape.start.y };
        const B = { x: shape.end.x, y: shape.end.y };
        const P = point;
        
        const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
        const AP = Math.sqrt(Math.pow(P.x - A.x, 2) + Math.pow(P.y - A.y, 2));
        const BP = Math.sqrt(Math.pow(P.x - B.x, 2) + Math.pow(P.y - B.y, 2));
        
        // Check if point is near endpoints
        if (AP <= threshold || BP <= threshold) return true;
        
        // Check if point is near line segment
        const s = (AB + AP + BP) / 2;
        const area = Math.sqrt(s * (s - AB) * (s - AP) * (s - BP));
        const distance = (2 * area) / AB;
        return distance <= threshold;
      }

      case 'rectangle': {
        const x1 = Math.min(shape.start.x, shape.end.x);
        const x2 = Math.max(shape.start.x, shape.end.x);
        const y1 = Math.min(shape.start.y, shape.end.y);
        const y2 = Math.max(shape.start.y, shape.end.y);

        // Check if point is near any of the four edges
        const edges = [
          { start: { x: x1, y: y1 }, end: { x: x2, y: y1 } }, // top
          { start: { x: x2, y: y1 }, end: { x: x2, y: y2 } }, // right
          { start: { x: x2, y: y2 }, end: { x: x1, y: y2 } }, // bottom
          { start: { x: x1, y: y2 }, end: { x: x1, y: y1 } }  // left
        ];

        return edges.some(edge => 
          isPointNearLineSegment(point, edge.start, edge.end, threshold)
        );
      }

      case 'circle': {
        if (shape.points && shape.points.length === 3) {
          const [p1, p2, p3] = shape.points;
          const center = calculateCircleCenter(p1, p2, p3);
          const radius = Math.sqrt(
            Math.pow(p1.x - center.x, 2) + 
            Math.pow(p1.y - center.y, 2)
          );

          const distance = Math.sqrt(
            Math.pow(point.x - center.x, 2) + 
            Math.pow(point.y - center.y, 2)
          );

          return Math.abs(distance - radius) <= threshold;
        }
        return false;
      }

      case 'curve':
      case 'closedCurve': {
        if (shape.points && shape.points.length >= 2) {
          // Check each segment of the curve
          for (let i = 0; i < shape.points.length - 1; i++) {
            if (isPointNearLineSegment(
              point,
              shape.points[i],
              shape.points[i + 1],
              threshold
            )) {
              return true;
            }
          }
          // For closed curves, check the last segment
          if (shape.type === 'closedCurve' && shape.points.length > 2) {
            if (isPointNearLineSegment(
              point,
              shape.points[shape.points.length - 1],
              shape.points[0],
              threshold
            )) {
              return true;
            }
          }
        }
        return false;
      }

      case 'arc': {
        if (shape.points && shape.points.length === 3) {
          const [p1, p2, p3] = shape.points;
          const center = calculateCircleCenter(p1, p2, p3);
          const radius = Math.sqrt(
            Math.pow(p1.x - center.x, 2) + 
            Math.pow(p1.y - center.y, 2)
          );

          const distance = Math.sqrt(
            Math.pow(point.x - center.x, 2) + 
            Math.pow(point.y - center.y, 2)
          );

          if (Math.abs(distance - radius) <= threshold) {
            const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
            const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);
            const pointAngle = Math.atan2(point.y - center.y, point.x - center.x);

            // Normalize angles
            let normalizedStartAngle = startAngle;
            let normalizedEndAngle = endAngle;
            let normalizedPointAngle = pointAngle;

            while (normalizedStartAngle < 0) normalizedStartAngle += Math.PI * 2;
            while (normalizedEndAngle < 0) normalizedEndAngle += Math.PI * 2;
            while (normalizedPointAngle < 0) normalizedPointAngle += Math.PI * 2;

            if (normalizedEndAngle < normalizedStartAngle) {
              normalizedEndAngle += Math.PI * 2;
            }

            return normalizedPointAngle >= normalizedStartAngle && 
                   normalizedPointAngle <= normalizedEndAngle;
          }
        }
        return false;
      }

      case 'text': {
        const textWidth = shape.content.length * 8;
        const textHeight = 14;

        return point.x >= shape.position.x - threshold && 
               point.x <= shape.position.x + textWidth + threshold && 
               point.y >= shape.position.y - threshold && 
               point.y <= shape.position.y + textHeight + threshold;
      }

      default:
        return false;
    }
  };

  // Add helper function to calculate circle center
  const calculateCircleCenter = (p1, p2, p3) => {
    const mid1 = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
    const mid2 = {
      x: (p2.x + p3.x) / 2,
      y: (p2.y + p3.y) / 2
    };
    
    const slope1 = -(p2.x - p1.x) / (p2.y - p1.y);
    const slope2 = -(p3.x - p2.x) / (p3.y - p2.y);
    
    return {
      x: (mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2),
      y: slope1 * ((mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2) - mid1.x) + mid1.y
    };
  };

  // Drawing functions for different tools
  const drawTools = {
    pointer: {
      mouseDown: () => {},
      mouseMove: () => {},
      mouseUp: () => {
        if (selectedShape) {
          const newShapes = shapes.map(shape => {
            if (shape.id === selectedShape.id) {
              return selectedShape;
            }
            return shape;
          });
          updateShapesWithHistory(newShapes);
        }
      },
    },
    point: {
      mouseDown: (coords) => {
        const newPoint = { 
          id: shapeIdCounter,
          type: 'point', 
          x: coords.x, 
          y: coords.y,
          label: `p${pointCounter}`,
          style: { 
            color: currentColor, 
            thickness: currentThickness,
            fontColor: currentFontColor 
          }
        };
        updateShapesWithHistory([...shapes, newPoint]);
        setPointCounter(prev => prev + 1);
        setShapeIdCounter(prev => prev + 1);
      },
      mouseMove: () => {},
      mouseUp: () => {},
    },
    line: {
      mouseDown: (coords) => {
        setStartPoint(coords);
        setIsDrawing(true);
        setCurrentShape({ 
          type: 'line', 
          start: coords, 
          end: coords,
          style: { 
            color: currentColor, 
            thickness: currentThickness,
            fontColor: currentFontColor 
          }
        });
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          setCurrentShape({ 
            type: 'line', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          });
        }
      },
      mouseUp: (coords) => {
        if (isDrawing) {
          const newLine = { 
            id: shapeIdCounter,
            type: 'line', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newLine]);
          setShapeIdCounter(prev => prev + 1);
          setIsDrawing(false);
        }
      },
    },
    rectangle: {
      mouseDown: (coords) => {
        setStartPoint(coords);
        setIsDrawing(true);
        setCurrentShape({ 
          type: 'rectangle', 
          start: coords, 
          end: coords,
          style: { 
            color: currentColor, 
            thickness: currentThickness,
            fontColor: currentFontColor 
          }
        });
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          setCurrentShape({ 
            type: 'rectangle', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          });
        }
      },
      mouseUp: (coords) => {
        if (isDrawing) {
          const newRect = { 
            id: shapeIdCounter,
            type: 'rectangle', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newRect]);
          setShapeIdCounter(prev => prev + 1);
          setIsDrawing(false);
        }
      },
    },
    circle: {
      mouseDown: (coords) => {
        if (!isDrawing) {
          setCurvePoints([coords]);
        setIsDrawing(true);
        } else if (curvePoints.length < 3) {
          setCurvePoints([...curvePoints, coords]);
        }
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          if (curvePoints.length === 1) {
            setCurrentShape({
              type: 'circle',
              points: [curvePoints[0], coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          } else if (curvePoints.length === 2) {
            setCurrentShape({
              type: 'circle',
              points: [...curvePoints, coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          }
        }
      },
      mouseUp: () => {},
      doubleClick: () => {
        if (isDrawing && curvePoints.length === 3) {
          const newCircle = {
            id: shapeIdCounter,
            type: 'circle',
            points: [...curvePoints],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newCircle]);
          setShapeIdCounter(prev => prev + 1);
          setCurvePoints([]);
          setCurrentShape(null);
        }
      },
    },
    curve: {
      mouseDown: (coords) => {
        if (!isDrawing) {
          setCurvePoints([coords]);
          setIsDrawing(true);
        } else {
          setCurvePoints([...curvePoints, coords]);
        }
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          setCurrentShape({
            type: 'curve',
            points: [...curvePoints, coords],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          });
        }
      },
      mouseUp: () => {},
      doubleClick: () => {
        if (isDrawing && curvePoints.length >= 2) {
          const newCurve = { 
            id: shapeIdCounter,
            type: 'curve', 
            points: [...curvePoints],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newCurve]);
          setShapeIdCounter(prev => prev + 1);
          setCurvePoints([]);
        }
      },
    },
    closedCurve: {
      mouseDown: (coords) => {
        if (!isDrawing) {
          setCurvePoints([coords]);
          setIsDrawing(true);
        } else {
          setCurvePoints([...curvePoints, coords]);
        }
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          setCurrentShape({
            type: 'closedCurve',
            points: [...curvePoints, coords],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          });
        }
      },
      mouseUp: () => {},
      doubleClick: () => {
        if (isDrawing && curvePoints.length > 2) {
          const points = [...curvePoints, curvePoints[0]]; // Close the curve
          const newClosedCurve = { 
            id: shapeIdCounter,
            type: 'closedCurve', 
            points, 
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newClosedCurve]);
          setShapeIdCounter(prev => prev + 1);
          setCurvePoints([]);
        }
      },
    },
    eraser: {
      mouseDown: (coords) => {
        setIsDrawing(true);
        eraseAtPoint(coords);
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          requestAnimationFrame(() => {
          eraseAtPoint(coords);
          });
        }
      },
      mouseUp: () => {
        setIsDrawing(false);
      }
    },
    move: {
      mouseDown: (coords) => {
        const clickedShape = shapes.findLast(shape => isPointInShape(coords, shape));
        if (clickedShape) {
          setSelectedShape(clickedShape);
          setIsMoving(true);
          setMoveOffset({
            x: coords.x,
            y: coords.y
          });
        }
      },
      mouseMove: (coords) => {
        if (isMoving && selectedShape) {
          const dx = coords.x - moveOffset.x;
          const dy = coords.y - moveOffset.y;

          let updatedShape = { ...selectedShape };
          
          switch (selectedShape.type) {
            case 'point':
              updatedShape = {
                ...selectedShape,
                x: selectedShape.x + dx,
                y: selectedShape.y + dy
              };
              break;
            case 'line':
            case 'arrow':
              updatedShape = {
                ...selectedShape,
                start: {
                  x: selectedShape.start.x + dx,
                  y: selectedShape.start.y + dy
                },
                end: {
                  x: selectedShape.end.x + dx,
                  y: selectedShape.end.y + dy
                }
              };
              break;
            case 'rectangle':
              updatedShape = {
                ...selectedShape,
                start: {
                  x: selectedShape.start.x + dx,
                  y: selectedShape.start.y + dy
                },
                end: {
                  x: selectedShape.end.x + dx,
                  y: selectedShape.end.y + dy
                }
              };
              break;
            case 'circle':
            case 'arc':
            case 'curve':
            case 'closedCurve':
              if (selectedShape.points) {
                updatedShape = {
                  ...selectedShape,
                  points: selectedShape.points.map(point => ({
                    x: point.x + dx,
                    y: point.y + dy
                  }))
                };
              }
              break;
            case 'text':
              updatedShape = {
                ...selectedShape,
                position: {
                  x: selectedShape.position.x + dx,
                  y: selectedShape.position.y + dy
                }
              };
              break;
          }

          setSelectedShape(updatedShape);
          setMoveOffset({
            x: coords.x,
            y: coords.y
          });

          const newShapes = shapes.map(shape =>
            shape.id === selectedShape.id ? updatedShape : shape
          );

          onShapesUpdate(newShapes);
        }
      },
      mouseUp: () => {
        if (isMoving && selectedShape) {
          const newShapes = shapes.map(shape =>
            shape.id === selectedShape.id ? selectedShape : shape
          );
          updateShapesWithHistory(newShapes);
          setIsMoving(false);
          setSelectedShape(null);
          setMoveOffset({ x: 0, y: 0 });
        }
      }
    },
    arc: {
      mouseDown: (coords) => {
        if (!isDrawing) {
          setCurvePoints([coords]);
        setIsDrawing(true);
        } else if (curvePoints.length < 3) {
          setCurvePoints([...curvePoints, coords]);
        }
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          if (curvePoints.length === 1) {
        setCurrentShape({ 
          type: 'arc', 
              points: [curvePoints[0], coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          } else if (curvePoints.length === 2) {
            setCurrentShape({
              type: 'arc',
              points: [...curvePoints, coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          }
        }
      },
      mouseUp: () => {},
      doubleClick: () => {
        if (isDrawing && curvePoints.length === 3) {
          const newArc = {
            id: shapeIdCounter,
            type: 'arc',
            points: [...curvePoints],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newArc]);
          setShapeIdCounter(prev => prev + 1);
          setCurvePoints([]);
          setCurrentShape(null);
        }
      },
    },
    arrow: {
      mouseDown: (coords) => {
        setStartPoint(coords);
        setIsDrawing(true);
        setCurrentShape({ 
          type: 'arrow', 
          start: coords, 
          end: coords,
          style: { 
            color: currentColor, 
            thickness: currentThickness,
            fontColor: currentFontColor 
          }
        });
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          setCurrentShape({
            type: 'arrow', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          });
        }
      },
      mouseUp: (coords) => {
        if (isDrawing) {
          const newArrow = { 
            id: shapeIdCounter,
            type: 'arrow', 
            start: startPoint, 
            end: coords,
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newArrow]);
          setShapeIdCounter(prev => prev + 1);
          setIsDrawing(false);
        }
      }
    },
    textbox: {
      mouseDown: (coords) => {
        setTextPosition(coords);
        setShowTextInput(true);
        setCurrentShape(null);
        setTimeout(() => {
          if (textInputRef.current) {
            textInputRef.current.focus();
          }
        }, 100);
      }
    },
    angle: {
      mouseDown: (coords) => {
        if (!isDrawing) {
          setCurvePoints([coords]);
          setIsDrawing(true);
        } else if (curvePoints.length < 3) {
          setCurvePoints([...curvePoints, coords]);
        }
      },
      mouseMove: (coords) => {
        if (isDrawing) {
          if (curvePoints.length === 1) {
            setCurrentShape({
              type: 'angle',
              points: [curvePoints[0], coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          } else if (curvePoints.length === 2) {
            setCurrentShape({
              type: 'angle',
              points: [...curvePoints, coords],
              style: { 
                color: currentColor, 
                thickness: currentThickness,
                fontColor: currentFontColor 
              }
            });
          }
        }
      },
      mouseUp: () => {},
      doubleClick: () => {
        if (isDrawing && curvePoints.length === 3) {
          const newAngle = {
            id: shapeIdCounter,
            type: 'angle',
            points: [...curvePoints],
            style: { 
              color: currentColor, 
              thickness: currentThickness,
              fontColor: currentFontColor 
            }
          };
          updateShapesWithHistory([...shapes, newAngle]);
          setShapeIdCounter(prev => prev + 1);
          setCurvePoints([]);
          setCurrentShape(null);
        }
      },
    },
  };

  // Update the eraser cursor effect
  useEffect(() => {
    if (selectedTool === 'eraser' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.style.cursor = 'none';
      
      const handleEraserCursor = (e) => {
        const coords = getCanvasCoordinates(e);
        
        // Clear and redraw everything
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw all shapes first
        shapes.forEach(shape => drawShape(ctx, shape));
        
        // Draw current shape if any
        if (currentShape) {
          drawShape(ctx, currentShape);
        }
        
        // Draw eraser cursor
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, eraserRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      };
      
      canvas.addEventListener('mousemove', handleEraserCursor);
      
      return () => {
        canvas.style.cursor = 'default';
        canvas.removeEventListener('mousemove', handleEraserCursor);
      };
    }
  }, [selectedTool, eraserRadius, shapes, currentShape, currentColor, currentThickness]);

  // Update the drawShapes function
  const drawShapes = (ctx) => {
    if (!ctx) return;
    
    // Clear the entire canvas first
    ctx.clearRect(0, 0, resolution.width, resolution.height);
    
    // Draw all saved shapes
    shapes.forEach(shape => drawShape(ctx, shape));
    
    // Draw current shape being drawn
    if (currentShape) {
      drawShape(ctx, currentShape);
    }
  };

  // Update the eraseAtPoint function with better shape detection
  const eraseAtPoint = (coords) => {
    if (!coords) return;

    const newShapes = shapes.filter(shape => {
      switch (shape.type) {
        case 'point': {
          const distance = Math.sqrt(
            Math.pow(coords.x - shape.x, 2) + 
            Math.pow(coords.y - shape.y, 2)
          );
          return distance > eraserRadius;
        }

        case 'line': {
          // Improved line detection
          const A = { x: shape.start.x, y: shape.start.y };
          const B = { x: shape.end.x, y: shape.end.y };
          const P = coords;
          
          const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
          const AP = Math.sqrt(Math.pow(P.x - A.x, 2) + Math.pow(P.y - A.y, 2));
          const BP = Math.sqrt(Math.pow(P.x - B.x, 2) + Math.pow(P.y - B.y, 2));
          
          // If point is beyond line segment, check distance to endpoints
          if (AP <= eraserRadius || BP <= eraserRadius) return false;
          
          // Check distance to line segment
          const s = (AB + AP + BP) / 2;
          const area = Math.sqrt(s * (s - AB) * (s - AP) * (s - BP));
          const distance = (2 * area) / AB;
          return distance > eraserRadius;
        }

        case 'rectangle': {
          const x1 = Math.min(shape.start.x, shape.end.x);
          const x2 = Math.max(shape.start.x, shape.end.x);
          const y1 = Math.min(shape.start.y, shape.end.y);
          const y2 = Math.max(shape.start.y, shape.end.y);

          // Check if point is near any of the four edges
          const edges = [
            { start: { x: x1, y: y1 }, end: { x: x2, y: y1 } }, // top
            { start: { x: x2, y: y1 }, end: { x: x2, y: y2 } }, // right
            { start: { x: x2, y: y2 }, end: { x: x1, y: y2 } }, // bottom
            { start: { x: x1, y: y2 }, end: { x: x1, y: y1 } }  // left
          ];

          return !edges.some(edge => 
            isPointNearLineSegment(coords, edge.start, edge.end, eraserRadius)
          );
        }

        case 'circle': {
          const center = shape.center;
          const distanceToCenter = Math.sqrt(
            Math.pow(coords.x - center.x, 2) + 
            Math.pow(coords.y - center.y, 2)
          );
          // Check if point is near the circumference
          return Math.abs(distanceToCenter - shape.radius) > eraserRadius;
        }

        case 'curve':
        case 'closedCurve': {
          const points = shape.points;
          // Check each segment of the curve
          for (let i = 0; i < points.length - 1; i++) {
            const A = points[i];
            const B = points[i + 1];
            const P = coords;
            
            const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
            const AP = Math.sqrt(Math.pow(P.x - A.x, 2) + Math.pow(P.y - A.y, 2));
            const BP = Math.sqrt(Math.pow(P.x - B.x, 2) + Math.pow(P.y - B.y, 2));
            
            // If point is near endpoints
            if (AP <= eraserRadius || BP <= eraserRadius) return false;
            
            // Check distance to line segment
            const s = (AB + AP + BP) / 2;
            const area = Math.sqrt(s * (s - AB) * (s - AP) * (s - BP));
            const distance = (2 * area) / AB;
            
            if (distance <= eraserRadius) return false;
          }
          return true;
      }

        case 'arc': {
          // Check if point is near the arc line
          const center = shape.center;
          const distanceToCenter = Math.sqrt(
            Math.pow(coords.x - center.x, 2) + 
            Math.pow(coords.y - center.y, 2)
          );
          
          if (Math.abs(distanceToCenter - shape.radius) <= eraserRadius) {
            // Calculate angle of point relative to center
            let pointAngle = Math.atan2(
              coords.y - center.y,
              coords.x - center.x
            );
            
            // Check if point angle is within arc angles
            let startAngle = shape.startAngle;
            let endAngle = shape.endAngle;
            
            // Normalize angles
            while (startAngle < 0) startAngle += Math.PI * 2;
            while (endAngle < 0) endAngle += Math.PI * 2;
            while (pointAngle < 0) pointAngle += Math.PI * 2;
            
            if (endAngle < startAngle) endAngle += Math.PI * 2;
            
            return !(pointAngle >= startAngle && pointAngle <= endAngle);
          }
          return true;
        }

        default:
          return true;
      }
    });

    if (newShapes.length !== shapes.length) {
      updateShapesWithHistory(newShapes);
      requestAnimationFrame(() => {
        if (ctxRef.current) {
          drawShapes(ctxRef.current);
        }
      });
    }
  };

  // Add useEffect to handle canvas clearing when tool changes
  useEffect(() => {
    if (canvasRef.current && ctxRef.current) {
      drawShapes(ctxRef.current);
    }
  }, [selectedTool]);

  // Load calibration when component mounts
  useEffect(() => {
    const loadCalibration = () => {
      const savedCalibration = localStorage.getItem('currentCalibration');
      if (savedCalibration) {
        const calibData = JSON.parse(savedCalibration);
        setCurrentCalibration(calibData);
        console.log('Loaded calibration:', calibData); // For debugging
      }
    };

    loadCalibration();
    // Listen for calibration changes
    window.addEventListener('storage', loadCalibration);
    return () => window.removeEventListener('storage', loadCalibration);
  }, []);

  // Helper function to convert pixels to microns
  const pixelsToMicrons = (pixels) => {
    if (!currentCalibration?.calibrationFactor) return pixels;
    // Divide pixels by pixels/micron to get microns
    return pixels / currentCalibration.calibrationFactor;
  };

  // Add isLeftClick helper near the top with other helper functions
  const isLeftClick = (e) => e.button === 0;

  // Update handleMouseDown with simpler offset calculation
  const handleMouseDown = (e) => {
    if (!ctxRef.current) return;
    
    const coords = getCanvasCoordinates(e);

    // Check for left-click
    if (isLeftClick(e)) {
      // Find the topmost shape that was clicked
      const clickedShape = shapes.findLast(shape => isPointInShape(coords, shape));
      
      if (clickedShape) {
        setSelectedShape(clickedShape);
        setIsMoving(true);
        
        // Simplified offset calculation
        setMoveOffset({
          x: coords.x,
          y: coords.y
        });
        return;
      }
    }

    // If we're not moving a shape, proceed with normal tool operations
    if (!selectedTool) return;
    
    const tool = drawTools[selectedTool];
    if (tool?.mouseDown) {
      tool.mouseDown(coords);
    }
  };

  // Update handleMouseMove with improved movement calculation
  const handleMouseMove = (e) => {
    if (!ctxRef.current) return;
    
    const coords = getCanvasCoordinates(e);

    // Handle shape movement
    if (isMoving && selectedShape) {
      const dx = coords.x - moveOffset.x;
      const dy = coords.y - moveOffset.y;

      const newShapes = shapes.map(shape => {
        if (shape.id === selectedShape.id) {
          return selectedShape;
        }
        return shape;
      });

      updateShapesWithHistory(newShapes);
      
      // Force immediate redraw
      requestAnimationFrame(() => {
        if (ctxRef.current) {
          drawShapes(ctxRef.current);
        }
      });
      return;
    }

    // If we're not moving a shape, proceed with normal tool operations
    if (!selectedTool || !isDrawing) return;
    
    const tool = drawTools[selectedTool];
    if (tool?.mouseMove) {
      tool.mouseMove(coords);
      drawShapes(ctxRef.current);
    }
  };

  // Update handleMouseUp
  const handleMouseUp = (e) => {
    if (!ctxRef.current) return;
    
    const coords = getCanvasCoordinates(e);

    // Handle end of shape movement
    if (isMoving) {
      setIsMoving(false);
      setSelectedShape(null);
      setMoveOffset({ x: 0, y: 0 });
      return; // Exit early if we were moving a shape
    }

    // If we weren't moving a shape, proceed with normal tool operations
    if (!selectedTool) return;
    
    const tool = drawTools[selectedTool];
    if (tool?.mouseUp) {
      tool.mouseUp(coords);
      drawShapes(ctxRef.current);
    }
  };

  const handleDoubleClick = (e) => {
    const tool = drawTools[selectedTool];
    if (tool?.doubleClick) {
      tool.doubleClick();
    }
  };

  // Helper function to draw shape outline for selection
  const drawShapeOutline = (ctx, shape) => {
    switch (shape.type) {
      case 'point': {
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, 3, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'line':
      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.lineTo(shape.end.x, shape.end.y);
        ctx.stroke();
        break;
      }
      case 'rectangle': {
        const width = Math.abs(shape.end.x - shape.start.x);
        const height = Math.abs(shape.end.y - shape.start.y);
        ctx.beginPath();
        ctx.rect(shape.start.x, shape.start.y, width, height);
        ctx.stroke();
        break;
      }
      case 'circle':
      case 'arc':
      case 'angle': {
        if (shape.points && shape.points.length === 3) {
          ctx.beginPath();
          if (shape.type === 'circle') {
            const [p1, p2, p3] = shape.points;
            const center = calculateCircleCenter(p1, p2, p3);
            const radius = Math.sqrt(
              Math.pow(p1.x - center.x, 2) + 
              Math.pow(p1.y - center.y, 2)
            );
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
          } else {
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            ctx.lineTo(shape.points[1].x, shape.points[1].y);
            ctx.lineTo(shape.points[2].x, shape.points[2].y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'curve':
      case 'closedCurve': {
        if (shape.points && shape.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          shape.points.slice(1).forEach(point => {
            ctx.lineTo(point.x, point.y);
          });
          if (shape.type === 'closedCurve') {
            ctx.closePath();
          }
          ctx.stroke();
        }
        break;
      }
      case 'text': {
        const textWidth = shape.content.length * 8;
        const textHeight = 14;
        ctx.beginPath();
        ctx.rect(
          shape.position.x - 2,
          shape.position.y - 12,
          textWidth + 4,
          textHeight + 4
        );
        ctx.stroke();
        break;
      }
    }
  };

  // Drawing function
  const drawShape = (ctx, shape) => {
    if (!ctx || !shape) return;

    // Get shape style with fallbacks
    const shapeStyle = shape.style || {};
    const color = shapeStyle.color || currentColor;
    const thickness = shapeStyle.thickness || currentThickness;
    const fontColor = shapeStyle.fontColor || currentFontColor;
    
    // Set up context styles
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    
    // If shape is selected, draw a highlight outline first
    if (shape === selectedShape) {
      ctx.save();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = thickness + 2;
      drawShapeOutline(ctx, shape);
      ctx.restore();
    }
    
    // Reset to shape's actual color and thickness
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.fillStyle = `${color}33`; // Add 33 for 20% opacity

    // Draw the actual shape
    switch (shape.type) {
      case 'point': {
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Use shape's font color for label
        ctx.fillStyle = fontColor;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(shape.label, shape.x, shape.y - 10);
        break;
      }
      case 'line': {
        // Draw main line
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.lineTo(shape.end.x, shape.end.y);
        ctx.stroke();
        
        // Draw perpendicular lines at endpoints
        const perpLength = 10;
        const angle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
        const perpAngle = angle + Math.PI/2;

        // Start point perpendicular line
        ctx.beginPath();
        ctx.moveTo(
          shape.start.x + Math.cos(perpAngle) * perpLength,
          shape.start.y + Math.sin(perpAngle) * perpLength
        );
        ctx.lineTo(
          shape.start.x - Math.cos(perpAngle) * perpLength,
          shape.start.y - Math.sin(perpAngle) * perpLength
        );
        ctx.stroke();

        // End point perpendicular line
        ctx.beginPath();
        ctx.moveTo(
          shape.end.x + Math.cos(perpAngle) * perpLength,
          shape.end.y + Math.sin(perpAngle) * perpLength
        );
        ctx.lineTo(
          shape.end.x - Math.cos(perpAngle) * perpLength,
          shape.end.y - Math.sin(perpAngle) * perpLength
        );
        ctx.stroke();

        // Calculate and display measurement
        const pixelDistance = Math.sqrt(
          Math.pow(shape.end.x - shape.start.x, 2) + 
          Math.pow(shape.end.y - shape.start.y, 2)
        );
        
        const micronsDistance = pixelsToMicrons(pixelDistance);

        // Display measurement
        const midX = (shape.start.x + shape.end.x) / 2;
        const midY = (shape.start.y + shape.end.y) / 2;
        
        ctx.fillStyle = fontColor;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(micronsDistance)} µm`, midX, midY);
        break;
      }
      case 'rectangle': {
        const width = Math.abs(shape.end.x - shape.start.x);
        const height = Math.abs(shape.end.y - shape.start.y);
        
        // Draw rectangle
        ctx.beginPath();
        ctx.rect(shape.start.x, shape.start.y, width, height);
        ctx.stroke();
        
        // Calculate measurements in microns
        const widthMicrons = Math.round(pixelsToMicrons(width));
        const heightMicrons = Math.round(pixelsToMicrons(height));
        const areaMicrons = Math.round(widthMicrons * heightMicrons);

        // Display measurements
        const centerX = shape.start.x + width/2;
        const centerY = shape.start.y + height/2;
        
        ctx.fillStyle = fontColor;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${widthMicrons} × ${heightMicrons} µm`, centerX, centerY - 10);
        ctx.fillText(`Area: ${areaMicrons} µm²`, centerX, centerY + 10);
        break;
      }
      case 'circle': {
        if (shape.points && shape.points.length === 3) {
          // Calculate circle from three points
          const [p1, p2, p3] = shape.points;
          
          // Calculate perpendicular bisectors
          const mid1 = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
          };
          const mid2 = {
            x: (p2.x + p3.x) / 2,
            y: (p2.y + p3.y) / 2
          };
          
          // Calculate slopes of perpendicular bisectors
          const slope1 = -(p2.x - p1.x) / (p2.y - p1.y);
          const slope2 = -(p3.x - p2.x) / (p3.y - p2.y);
          
          // Calculate center (intersection of perpendicular bisectors)
          const center = {
            x: (mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2),
            y: slope1 * ((mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2) - mid1.x) + mid1.y
          };
          
          // Calculate radius
          const radius = Math.sqrt(
            Math.pow(p1.x - center.x, 2) + 
            Math.pow(p1.y - center.y, 2)
          );
          
        // Draw circle
        ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        
          // Draw the three points
          shape.points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
          
          // Calculate and display measurements
          const radiusMicrons = Math.round(pixelsToMicrons(radius));
        const areaMicrons = Math.round(Math.PI * radiusMicrons * radiusMicrons);
        
          // Display measurements
          ctx.fillStyle = fontColor;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`R: ${radiusMicrons} µm`, center.x, center.y - 15);
          ctx.fillText(`Area: ${areaMicrons} µm²`, center.x, center.y + 5);
        } else if (shape.points && shape.points.length === 2) {
          // Draw preview line
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.stroke();
        }
        break;
      }
      case 'curve': {
        if (shape.points && shape.points.length >= 2) {
          // Draw the curve using quadratic curves for smoother appearance
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          
          for (let i = 1; i < shape.points.length - 1; i++) {
            const xc = (shape.points[i].x + shape.points[i + 1].x) / 2;
            const yc = (shape.points[i].y + shape.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(shape.points[i].x, shape.points[i].y, xc, yc);
          }
          
          // Handle the last segment
        if (shape.points.length > 1) {
            const last = shape.points.length - 1;
            ctx.quadraticCurveTo(
              shape.points[last].x,
              shape.points[last].y,
              shape.points[last].x,
              shape.points[last].y
            );
          }
          
          ctx.stroke();

          // Calculate and display length
          let length = 0;
          for (let i = 1; i < shape.points.length; i++) {
            length += Math.sqrt(
              Math.pow(shape.points[i].x - shape.points[i-1].x, 2) +
              Math.pow(shape.points[i].y - shape.points[i-1].y, 2)
            );
          }
          const lengthMicrons = Math.round(pixelsToMicrons(length));

          // Display length
          const lastPoint = shape.points[shape.points.length - 1];
          ctx.fillStyle = fontColor;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'left';
          ctx.fillText(`${lengthMicrons} µm`, lastPoint.x + 15, lastPoint.y);
        }
        break;
      }
      case 'closedCurve': {
        if (shape.points && shape.points.length > 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          shape.points.slice(1).forEach(point => {
            ctx.lineTo(point.x, point.y);
          });
            ctx.closePath();
            ctx.stroke();
          ctx.fill();

            // Calculate area using shoelace formula
            let area = 0;
            for (let i = 0; i < shape.points.length - 1; i++) {
              area += shape.points[i].x * shape.points[i + 1].y - 
                      shape.points[i + 1].x * shape.points[i].y;
            }
            area = Math.abs(area) / 2;
          const areaMicrons = Math.round(pixelsToMicrons(area));

          // Display area
          const lastPoint = shape.points[shape.points.length - 1];
          ctx.fillStyle = fontColor;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'left';
          ctx.fillText(`${areaMicrons} µm²`, lastPoint.x + 15, lastPoint.y);
        }
        break;
      }
      case 'arc': {
        if (shape.points && shape.points.length === 3) {
          // Calculate circle from three points
          const [p1, p2, p3] = shape.points;
          
          // Calculate perpendicular bisectors
          const mid1 = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
          };
          const mid2 = {
            x: (p2.x + p3.x) / 2,
            y: (p2.y + p3.y) / 2
          };
          
          // Calculate slopes of perpendicular bisectors
          const slope1 = -(p2.x - p1.x) / (p2.y - p1.y);
          const slope2 = -(p3.x - p2.x) / (p3.y - p2.y);
          
          // Calculate center
          const center = {
            x: (mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2),
            y: slope1 * ((mid2.y - mid1.y + slope1 * mid1.x - slope2 * mid2.x) / (slope1 - slope2) - mid1.x) + mid1.y
          };
          
          // Calculate radius
          const radius = Math.sqrt(
            Math.pow(p1.x - center.x, 2) + 
            Math.pow(p1.y - center.y, 2)
          );
          
          // Calculate angles
          const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
          const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);
          
          // Draw arc
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, startAngle, endAngle);
          ctx.stroke();
          
          // Draw the three points
          shape.points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
          
          // Calculate and display measurements
          const arcLength = Math.abs(endAngle - startAngle) * radius;
          const angle = Math.abs((endAngle - startAngle) * (180 / Math.PI));
          const radiusMicrons = Math.round(pixelsToMicrons(radius));
          const arcLengthMicrons = Math.round(pixelsToMicrons(arcLength));
          
          // Display measurements
          const textX = center.x + (radius * 0.7) * Math.cos((startAngle + endAngle) / 2);
          const textY = center.y + (radius * 0.7) * Math.sin((startAngle + endAngle) / 2);
          
          ctx.fillStyle = fontColor;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'left';
          ctx.fillText(`R: ${radiusMicrons}µm`, textX - 55, textY - 30);
          ctx.fillText(`L: ${arcLengthMicrons}µm`, textX - 55, textY - 15);
          ctx.fillText(`A: ${angle.toFixed(1)}°`, textX - 55, textY);
        } else if (shape.points && shape.points.length === 2) {
          // Draw preview line
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.stroke();
        }
        break;
      }
      case 'arrow': {
        // Draw the main line
        ctx.beginPath();
        ctx.moveTo(shape.start.x, shape.start.y);
        ctx.lineTo(shape.end.x, shape.end.y);
        ctx.stroke();

        // Calculate arrow head
        const angle = Math.atan2(shape.end.y - shape.start.y, shape.end.x - shape.start.x);
        const headLength = 20;
        const headAngle = Math.PI / 6; // 30 degrees

        // Draw arrow head
        ctx.beginPath();
        ctx.moveTo(shape.end.x, shape.end.y);
        ctx.lineTo(
          shape.end.x - headLength * Math.cos(angle - headAngle),
          shape.end.y - headLength * Math.sin(angle - headAngle)
        );
        ctx.moveTo(shape.end.x, shape.end.y);
        ctx.lineTo(
          shape.end.x - headLength * Math.cos(angle + headAngle),
          shape.end.y - headLength * Math.sin(angle + headAngle)
        );
        ctx.stroke();
        break;
      }
      case 'text': {
        // Use shape's font color for text
        ctx.fillStyle = fontColor;
        ctx.fillText(shape.content, shape.position.x, shape.position.y);
        break;
      }
      case 'angle': {
        if (shape.points && shape.points.length === 3) {
          const [p1, p2, p3] = shape.points;
          
          // Draw the angle lines
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.stroke();

          // Draw the points
          shape.points.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Label the points
            ctx.fillStyle = fontColor;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`P${index + 1}`, point.x, point.y - 15);
          });

          // Calculate angle
          const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
          let angle = Math.abs(angle2 - angle1) * (180 / Math.PI);
          
          // Normalize angle to be between 0 and 180 degrees
          if (angle > 180) {
            angle = 360 - angle;
          }

          // Draw arc to show angle
          const arcRadius = 30;
          const startAngle = Math.min(angle1, angle2);
          const endAngle = Math.max(angle1, angle2);
          
          // Draw the angle arc
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, arcRadius, startAngle, endAngle);
          ctx.stroke();

          // Add angle measurement text
          const textX = p2.x + (arcRadius + 10) * Math.cos((angle1 + angle2) / 2);
          const textY = p2.y + (arcRadius + 10) * Math.sin((angle1 + angle2) / 2);
          
          ctx.fillStyle = fontColor;
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(`${angle.toFixed(1)}°`, textX, textY);

          // Add perpendicular lines at the vertex
          const perpLength = 10;
          const perpAngle = (angle1 + angle2) / 2 + Math.PI/2;
          
          ctx.beginPath();
          ctx.moveTo(
            p2.x + Math.cos(perpAngle) * perpLength,
            p2.y + Math.sin(perpAngle) * perpLength
          );
          ctx.lineTo(
            p2.x - Math.cos(perpAngle) * perpLength,
            p2.y - Math.sin(perpAngle) * perpLength
          );
          ctx.stroke();

        } else if (shape.points && shape.points.length === 2) {
          // Draw preview line
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.stroke();
        }
        break;
      }
    }
  };

  useEffect(() => {
    if (isRecording) {
      setVideoUrl(`http://localhost:5000/api/video-feed?t=${new Date().getTime()}`);
      setImageUrl(null);
    } else {
      setVideoUrl(null);
    }
  }, [isRecording]);

  // Update resolution handling
  useEffect(() => {
    const handleSettingsChange = () => {
      const savedSettings = localStorage.getItem('cameraSettings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          const [width, height] = settings.resolution.split('x').map(Number);
          
          // Update resolution state
          setResolution({ width, height });
          
          // Update canvas dimensions
          if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            
            // Redraw shapes with new dimensions
            if (ctxRef.current) {
              drawShapes(ctxRef.current);
            }
          }
        } catch (error) {
          console.error('Error loading camera settings:', error);
        }
      }
    };
    
    // Initial load
    handleSettingsChange();
    
    // Listen for storage events
    window.addEventListener('storage', handleSettingsChange);

    return () => {
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);

  // Update canvas context when resolution changes
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      
      // Set canvas size
      canvas.width = resolution.width;
      canvas.height = resolution.height;
      
      // Set up initial context styles
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'top';
      
      // Redraw shapes
      drawShapes(ctx);
    }
  }, [resolution]);

  // Update image loading to use resolution
  useEffect(() => {
    if (imagePath && imagePath !== prevImagePathRef.current) {
      prevImagePathRef.current = imagePath;
      
      const formattedPath = imagePath.replace(/\\/g, '/');
      fetch(`http://localhost:5000/api/get-image?path=${encodeURIComponent(formattedPath)}`)
        .then(response => {
          if (!response.ok) throw new Error('Failed to fetch image');
          return response.blob();
        })
        .then(blob => {
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          const newUrl = URL.createObjectURL(blob);
          setImageUrl(newUrl);
          if (onImageLoad) onImageLoad(newUrl);
        })
        .catch(error => {
          console.error('Error loading image:', error);
          setImageUrl(null);
        });
    }
  }, [imagePath, resolution]);

  // Add effect to watch for camera settings changes
  useEffect(() => {
    const handleSettingsChange = () => {
      const savedSettings = localStorage.getItem('cameraSettings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          const [width, height] = settings.resolution.split('x').map(Number);
          
          // Update both resolution and dimensions
          setResolution({ width, height });
          setDimensions({ width, height });
          
          // Recalculate scale for new dimensions
          if (displayRef.current) {
            const newScale = calculateOptimalScale(width, height);
            setScale(newScale);
          }

          // If canvas exists, update its dimensions
          if (canvasRef.current) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
          }
        } catch (error) {
          console.error('Error loading camera settings:', error);
        }
      }
    };

    // Listen for storage events
    window.addEventListener('storage', handleSettingsChange);
    
    // Initial load
    handleSettingsChange();

    return () => {
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);

  // Modify the calculateOptimalScale function to not scale down large resolutions
  const calculateOptimalScale = (width, height) => {
    if (!displayRef.current) return 1;
    
    // Always return 1 to maintain original size
    return 1;
  };

  // Add helper text overlay
  const renderHelperText = () => {
    if (!selectedTool) return null;

    const helpText = {
      pointer: 'Click to select objects',
      line: 'Click and drag to measure distance',
      rectangle: 'Click and drag to measure area',
      circle: 'Click and drag to measure radius and area',
      point: 'Click to place a point marker',
      curve: 'Click points to draw curve, double-click to finish',
      closedCurve: 'Click points to draw shape, double-click to close',
      eraser: 'Click and drag to erase measurements',
    };

    return (
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white px-4 py-2 rounded-full text-sm">
        {helpText[selectedTool]}
      </div>
    );
  };

  // Add these helper functions for eraser
  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const isPointNearCircle = (point, circle, threshold) => {
    const distance = getDistance(point, circle.center);
    return Math.abs(distance - circle.radius) <= threshold;
  };

  const isPointNearCurve = (point, points, threshold) => {
    for (let i = 0; i < points.length - 1; i++) {
      if (isPointNearLineSegment(point, points[i], points[i + 1], threshold)) {
        return true;
      }
    }
    return false;
  };

  // Add helper function to get points on a line (for smooth erasing)
  const getPointsOnLine = (start, end) => {
    const points = [];
    const distance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    
    // Get points every few pixels for smooth erasing
    const steps = Math.ceil(distance / 5); // 5 pixels between points
    for (let i = 0; i <= steps; i++) {
      points.push({
        x: start.x + (end.x - start.x) * (i / steps),
        y: start.y + (end.y - start.y) * (i / steps)
      });
    }
    return points;
  };

  // Improved helper function for rectangle detection
  const isPointNearRectangle = (point, rect, threshold) => {
    const x1 = Math.min(rect.start.x, rect.end.x);
    const x2 = Math.max(rect.start.x, rect.end.x);
    const y1 = Math.min(rect.start.y, rect.end.y);
    const y2 = Math.max(rect.start.y, rect.end.y);

    // Check if point is inside the rectangle
    if (point.x >= x1 - threshold && point.x <= x2 + threshold &&
        point.y >= y1 - threshold && point.y <= y2 + threshold) {
      // If point is near the edge
      const nearHorizontalEdge = Math.abs(point.y - y1) <= threshold || Math.abs(point.y - y2) <= threshold;
      const nearVerticalEdge = Math.abs(point.x - x1) <= threshold || Math.abs(point.x - x2) <= threshold;
      return nearHorizontalEdge || nearVerticalEdge;
    }
    return false;
  };

  // Add this helper function for line segment detection
  const isPointNearLineSegment = (point, start, end, threshold) => {
    const A = point.x - start.x;
    const B = point.y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = start.x;
      yy = start.y;
    } else if (param > 1) {
      xx = end.x;
      yy = end.y;
    } else {
      xx = start.x + param * C;
      yy = start.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= threshold;
  };

  // Add effect to clear currentShape when shapes are cleared
  useEffect(() => {
    if (shapes.length === 0) {
      setCurrentShape(null);
      setIsDrawing(false);
      setCurvePoints([]);
      if (ctxRef.current) {
        drawShapes(ctxRef.current);
      }
    }
  }, [shapes]);

  // Add text submission handler
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput && textPosition) {
      const newText = {
        id: shapeIdCounter,
        type: 'text',
        position: textPosition,
        content: textInput,
        style: { 
          color: currentColor, 
          thickness: currentThickness,
          fontColor: currentFontColor 
        }
      };
      updateShapesWithHistory([...shapes, newText]);
      setTextInput('');
      setShowTextInput(false);
      setTextPosition(null);
      setShapeIdCounter(prev => prev + 1);
    }
  };

  // Add effect to reset point counter when shapes are cleared
  useEffect(() => {
    if (shapes.length === 0) {
      setPointCounter(1);
    }
  }, [shapes]);

  // Add shape selection handler
  const handleShapeSelect = (shape) => {
    setSelectedShape(shape);
  };

  // Add function to update shapes with history tracking
  const updateShapesWithHistory = (newShapes) => {
    // Remove any future states if we're not at the latest state
    const newHistory = history.slice(0, historyIndex + 1);
    // Add the new state
    newHistory.push(newShapes);
    // Update history and move to latest state
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    // Update shapes through the original callback
    onShapesUpdate(newShapes);
  };

  // Add undo function
  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onShapesUpdate(history[newIndex]);
    }
  };

  // Add redo function
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onShapesUpdate(history[newIndex]);
    }
  };

  // Add keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Add undo/redo buttons to the UI
  return (
    <div 
      className="relative w-full h-full flex items-center justify-center bg-gray-50"
      ref={containerRef}
      onWheel={handleWheel}
    >
      {/* Undo/Redo Buttons */}
      <div className="absolute top-2 right-2 flex gap-2 z-50">
        <button
          className={`p-2 rounded ${historyIndex > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400'} text-white`}
          onClick={handleUndo}
          disabled={historyIndex === 0}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className={`p-2 rounded ${historyIndex < history.length - 1 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400'} text-white`}
          onClick={handleRedo}
          disabled={historyIndex === history.length - 1}
          title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
        >
          Redo
        </button>
      </div>

      {/* Centered, Responsive Image Area */}
      <div 
        className="relative flex items-center justify-center w-full h-full bg-white overflow-hidden p-12"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Image Layer with Default Image */}
        {videoUrl ? (
          <img
            src={videoUrl}
            alt="Live Feed"
            className="block mx-auto my-auto max-w-full max-h-full"
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Captured Image"
            className="block mx-auto my-auto max-w-full max-h-full"
            onError={(e) => {
              console.error('Error displaying image');
              setImageUrl(null);
            }}
          />
        ) : (
          // Default Envision logo
          <img
            src={envisionLogo}
            alt="Envision Logo"
            className="block mx-auto my-auto max-w-full max-h-full"
          />
        )}

        {/* Drawing Canvas Layer */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-auto"
          style={{ width: '100%', height: '100%' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Add text input overlay */}
      {showTextInput && textPosition && (
        <div 
          className="absolute"
          style={{
            left: `${textPosition.x}px`,
            top: `${textPosition.y}px`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <form onSubmit={handleTextSubmit} className="flex items-center gap-2 bg-white rounded shadow-lg p-2">
            <input
              ref={textInputRef}
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="px-2 py-1 text-sm border border-gray-300 rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter text..."
              autoFocus
            />
            <button 
              type="submit"
              className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add
            </button>
          </form>
      </div>
      )}
    </div>
  );
};

export default Display;