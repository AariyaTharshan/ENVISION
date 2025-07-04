import cv2
import numpy as np
from flask import jsonify
import os
import json
from scipy import stats
import matplotlib.pyplot as plt
from io import BytesIO
import base64
import urllib.parse

class PorosityAnalyzer:
    def __init__(self):
        self.calibration_factor = 1.0  # microns per pixel
        self.filters = []
        self.configs = {}
        self.cumulative_results = [] # Initialize list to store cumulative results
        
    def set_calibration(self, factor):
        self.calibration_factor = factor
        
    def add_filter(self, filter_type, params):
        self.filters.append({
            'type': filter_type,
            'params': params
        })
        
    def clear_filters(self):
        self.filters = []
        
    def save_config(self, name, config):
        self.configs[name] = config
        
    def load_config(self, name):
        return self.configs.get(name)

    def _get_absolute_path(self, image_path):
        """Converts a given path to an absolute, normalized OS path."""
        try:
            print(f"DEBUG: _get_absolute_path received: '{image_path}'")

            # Remove any potential 'file:///' or 'file://' prefix if it somehow slipped through or was added.
            # This is a defensive measure. Frontend should handle this.
            if image_path.startswith('file:///'):
                path = image_path[8:] # Strip 'file:///' (8 characters)
            elif image_path.startswith('file://'):
                path = image_path[7:] # Strip 'file://' (7 characters)
            else:
                path = image_path

            # Normalize path separators to be OS-specific and get absolute path
            # os.path.normpath converts slashes to backslashes on Windows if needed
            abs_path = os.path.abspath(os.path.normpath(path))

            print(f"DEBUG: Resolved absolute path: '{abs_path}'")

            if not os.path.exists(abs_path):
                print(f"ERROR: File not found at: '{abs_path}'")
                raise ValueError(f'Image file not found: {abs_path}')

            print(f"DEBUG: File found at: '{abs_path}'")
            return abs_path

        except Exception as e:
            print(f"ERROR in _get_absolute_path: {str(e)}")
            raise ValueError(f"Invalid image path or file not accessible: {str(e)}")

    def analyze_porosity(self, image_path, unit='microns', features='dark', filter_settings=None, view_option='summary', min_threshold=0, max_threshold=255):
        try:
            if not os.path.exists(image_path):
                return {
                    'status': 'error',
                    'message': f'Image file not found: {image_path}'
                }

            # Read and validate image
            image = cv2.imread(image_path)
            if image is None:
                return {
                    'status': 'error',
                    'message': f'Failed to read image: {image_path}'
                }

            height, width = image.shape[:2]
            
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply preprocessing based on features
            if features == 'dark':
                # Invert if looking for dark features
                gray = 255 - gray
                
            # Apply thresholding
            _, binary_min = cv2.threshold(gray, min_threshold, 255, cv2.THRESH_BINARY)
            _, binary_max = cv2.threshold(gray, max_threshold, 255, cv2.THRESH_BINARY_INV)
            binary = cv2.bitwise_and(binary_min, binary_max)
            
            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            
            results = []
            
            # Process each contour
            for i, contour in enumerate(contours):
                try:
                    # Calculate properties
                    area = cv2.contourArea(contour)
                    perimeter = cv2.arcLength(contour, True)
                    x, y, w, h = cv2.boundingRect(contour)
                    
                    # Filter out contours that are too large (e.g., image border)
                    # Assuming that actual pores will not take up a significant portion of the image area
                    image_area = height * width
                    if area / image_area > 0.90:  # If contour area is more than 90% of image area, skip it
                        continue
                    
                    # Calculate moments for center
                    M = cv2.moments(contour)
                    if M["m00"] != 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                    else:
                        cx = x + w//2
                        cy = y + h//2
                    
                    # Calculate center coordinates as percentages
                    center_x = (cx / width) * 100
                    center_y = (cy / height) * 100
                
                    # Calculate circularity using a more accurate formula
                    # Circularity = 4π * Area / (Perimeter^2)
                    # A perfect circle has circularity = 1
                    circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0

                    # Calculate equivalent diameter for more accurate width
                    equivalent_diameter = np.sqrt(4 * area / np.pi)

                    # Convert to selected unit
                    if unit == 'microns':
                        # Convert all measurements using calibration factor
                        length = h * self.calibration_factor
                        width = equivalent_diameter * self.calibration_factor  # Use equivalent diameter instead of bounding box width
                        area = area * (self.calibration_factor ** 2)
                        perimeter = perimeter * self.calibration_factor
                    else:
                        length = h
                        width = equivalent_diameter

                    # Apply filters if provided
                    if filter_settings:
                        if not self._validate_pore_against_filters(length, width, area, circularity, filter_settings):
                            continue

                    results.append({
                        'id': i + 1,
                        'length': round(length, 2),
                        'width': round(width, 2),
                        'area': round(area, 2),
                        'circ': round(circularity, 2),
                        'per': round(perimeter, 2),
                        'q': 0,  # Quality flag
                        'x': round(center_x, 2),
                        'y': round(center_y, 2),
                        'bbox': [x, y, w, h]
                    })

                except Exception as e:
                    print(f"Error processing contour {i}: {str(e)}")
                    continue

            if not results:
                return {
                    'status': 'error',
                    'message': 'No pores found matching the filter criteria'
                }

            # Generate histogram if needed
            histogram_data = None
            if view_option != 'summary':
                histogram_data = self.generate_histogram(results, view_option)

            # Save analyzed image
            output_path = self._save_analyzed_image(image, results, image_path)

            return {
                'status': 'success',
                'results': results,
                'statistics': self._calculate_statistics(results),
                'plot_data': self._generate_distribution_plot(results),
                'analyzed_image_path': output_path,
                'histogram': histogram_data
            }

        except Exception as e:
            print(f"Error in analyze_porosity: {str(e)}")
            return {
                'status': 'error',
                'message': f'Error analyzing image: {str(e)}'
            }

    def _validate_pore_against_filters(self, length, width, area, circularity, filter_settings):
        """Validate a pore against the provided filter settings"""
        try:
            # Check circularity filter
            if filter_settings.get('circularity', {}).get('enabled', False):
                circ_settings = filter_settings['circularity']
                if not (circ_settings['min'] <= circularity <= circ_settings['max']):
                    return False

            # Check length filter
            if filter_settings.get('length', {}).get('enabled', False):
                length_settings = filter_settings['length']
                if not (length_settings['min'] <= length <= length_settings['max']):
                    return False

            # Check area filter
            if filter_settings.get('area', {}).get('enabled', False):
                area_settings = filter_settings['area']
                if not (area_settings['min'] <= area <= area_settings['max']):
                    return False

            return True
        except Exception as e:
            print(f"Error validating pore against filters: {str(e)}")
            return False

    def _save_analyzed_image(self, image, results, original_path):
        """Save the analyzed image with pore annotations"""
        try:
            # Create output directory if it doesn't exist
            output_dir = os.path.join(os.path.dirname(original_path), 'analyzed')
            os.makedirs(output_dir, exist_ok=True)

            # Create output filename
            base_name = os.path.splitext(os.path.basename(original_path))[0]
            output_path = os.path.join(output_dir, f"{base_name}_analyzed.png")

            # Draw annotations on the image
            annotated = image.copy()
            for pore in results:
                x, y, w, h = pore['bbox']
                cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
                cv2.putText(annotated, str(pore['id']), (x, y - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

            # Save the annotated image
            cv2.imwrite(output_path, annotated)
            return output_path

        except Exception as e:
            print(f"Error saving analyzed image: {str(e)}")
            return None

    def prepare_image(self, image_path, prep_option):
        """
        Prepare image for porosity analysis with enhanced options
        """
        try:
            # Read image
            img = cv2.imread(image_path)
            if img is None:
                return {
                    'status': 'error',
                    'message': 'Failed to read image'
                }

            # Apply selected preparation method
            if prep_option == 'threshold':
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                processed = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            elif prep_option == 'edge_detect':
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                processed = cv2.Canny(gray, 100, 200)
            elif prep_option == 'adaptive':
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                processed = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                               cv2.THRESH_BINARY, 11, 2)
            elif prep_option == 'morphological':
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                kernel = np.ones((3,3), np.uint8)
                processed = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
                processed = cv2.morphologyEx(processed, cv2.MORPH_CLOSE, kernel)
            else:
                return {
                    'status': 'error',
                    'message': 'Invalid preparation option'
                }

            # Save processed image
            directory = os.path.dirname(image_path)
            filename = os.path.basename(image_path)
            name, ext = os.path.splitext(filename)
            new_filename = f"{name}_{prep_option}{ext}"
            new_path = os.path.join(directory, new_filename)
            
            cv2.imwrite(new_path, processed)

            return {
                'status': 'success',
                'filepath': new_path
            }

        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }

    def _calculate_statistics(self, results):
        """Calculate statistical measures for the results"""
        if not results:
            return {}
            
        areas = [r['area'] for r in results]
        lengths = [r['length'] for r in results]
        widths = [r['width'] for r in results]
        circularities = [r['circ'] for r in results]
        
        return {
            'total_pores': len(results),
            'mean_area': np.mean(areas),
            'std_area': np.std(areas),
            'mean_length': np.mean(lengths),
            'mean_width': np.mean(widths),
            'mean_circularity': np.mean(circularities),
            'area_distribution': {
                'min': min(areas),
                'max': max(areas),
                'median': np.median(areas),
                'q1': np.percentile(areas, 25),
                'q3': np.percentile(areas, 75)
            }
        }

    def _generate_distribution_plot(self, results):
        """Generate distribution plot data"""
        if not results:
            return None
            
        areas = [r['area'] for r in results]
        
        plt.figure(figsize=(8, 6))
        plt.hist(areas, bins=20, edgecolor='black')
        plt.title('Area Distribution')
        plt.xlabel('Area')
        plt.ylabel('Frequency')
        
        # Save plot to base64 string
        buffer = BytesIO()
        plt.savefig(buffer, format='png')
        buffer.seek(0)
        plot_data = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        
        return plot_data

    def apply_filters(self, results, filter_settings):
        """Apply filters to results based on filter settings"""
        filtered_results = []
        for result in results:
            # Check circularity filter
            if filter_settings.get('circularity', {}).get('enabled'):
                circ_min = filter_settings['circularity'].get('min', 0)
                circ_max = filter_settings['circularity'].get('max', 1)
                if not (circ_min <= result['circ'] <= circ_max):
                    continue

            # Check length filter
            if filter_settings.get('length', {}).get('enabled'):
                length_min = filter_settings['length'].get('min', 0)
                length_max = filter_settings['length'].get('max', float('inf'))
                if not (length_min <= result['length'] <= length_max):
                    continue

            # Check area filter
            if filter_settings.get('area', {}).get('enabled'):
                area_min = filter_settings['area'].get('min', 0)
                area_max = filter_settings['area'].get('max', float('inf'))
                if not (area_min <= result['area'] <= area_max):
                    continue

            # Apply interval coloring
            for interval in filter_settings.get('intervals', []):
                if interval['from'] <= result['length'] < interval['to']:
                    result['color'] = interval['color']
                    break

            filtered_results.append(result)

        return filtered_results

    def generate_histogram(self, results, view_option):
        """Generate histogram data based on view option"""
        if not results:
            return None

        values = []
        if view_option == 'byLength':
            values = [r['length'] for r in results]
        elif view_option == 'byWidth':
            values = [r['width'] for r in results]
        elif view_option == 'byArea':
            values = [r['area'] for r in results]
        elif view_option == 'byCirc':
            values = [r['circ'] for r in results]
        else:
            return None

        hist, bins = np.histogram(values, bins='auto')
        return {
            'counts': hist.tolist(),
            'bins': bins.tolist(),
            'min': min(values) if values else 0,
            'max': max(values) if values else 255 # Ensure max is 255 if values are empty
        }

    def get_image_histogram_data(self, image_path):
        """Generate histogram data for a given image's grayscale intensity."""
        try:
            img = cv2.imread(image_path)
            if img is None:
                return {'status': 'error', 'message': 'Failed to read image'}
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
            return {
                'status': 'success',
                'counts': hist.flatten().tolist(),
                'bins': list(range(256)) # 0-255 intensity values
            }
        except Exception as e:
            return {'status': 'error', 'message': f'Error generating histogram: {str(e)}'}

    def apply_intensity_threshold(self, image_path, min_threshold, max_threshold, features='dark'):
        """Apply intensity thresholding to an image and return the processed image (binary mask)."""
        try:
            img = cv2.imread(image_path)
            if img is None:
                return {'status': 'error', 'message': 'Failed to read image'}
            
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            if features == 'dark':
                gray = 255 - gray # Invert for dark features

            # Create a mask for the specified intensity range
            _, binary_min = cv2.threshold(gray, min_threshold, 255, cv2.THRESH_BINARY)
            _, binary_max = cv2.threshold(gray, max_threshold, 255, cv2.THRESH_BINARY_INV)
            processed_image = cv2.bitwise_and(binary_min, binary_max)

            # Encode processed image to base64 for frontend display
            _, buffer = cv2.imencode('.png', processed_image)
            encoded_image = base64.b64encode(buffer).decode('utf-8')

            return {'status': 'success', 'image': encoded_image}
        except Exception as e:
            return {'status': 'error', 'message': f'Error applying intensity threshold: {str(e)}'}

# Create global analyzer instance
analyzer = PorosityAnalyzer()