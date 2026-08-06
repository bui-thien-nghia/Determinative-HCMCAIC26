import ipywidgets as widgets
from pathlib import Path
from qdrant_client import models
from IPython.display import display

class NotebookDisplay:
    def __init__(self, cell_width, num_cols):
        self.cell_width = cell_width
        self.num_cols = num_cols


    def display(self, points: list[models.ScoredPoint], print_paths: bool = True):
        img_paths = [widgets.Image(value=open(point.payload["frame_path"], "rb").read(),
                                   format="jpg",
                                   width=self.cell_width)
                     for point in points]
        for i in range(0, len(img_paths), self.num_cols):
            if i + self.num_cols > len(img_paths):
                images = img_paths[i:len(img_paths)]
            else:
                images = img_paths[i:i+self.num_cols]

            row = widgets.HBox(images)
            display(row)
            if print_paths: print([f"{Path(point.payload["frame_path"]).parts[-2]}_{Path(point.payload['frame_path']).stem}"
                                   for point in points[i:i+self.num_cols]])


class Benchmarker:
    pass