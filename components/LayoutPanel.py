"""
选择布局方式的页面
"""
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import QGridLayout, QLabel, QWidget

layoutList = [
    [(0, 0, 1, 1)], [(0, 0, 1, 1), (0, 1, 1, 1)], [(0, 0, 1, 1), (1, 0, 1, 1)],
    [(0, 0, 1, 1), (1, 0, 1, 1), (2, 0, 1, 1)], [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1)],
    [(0, 0, 2, 2), (0, 2, 1, 1), (1, 2, 1, 1)], [(0, 0, 2, 2), (2, 0, 1, 1), (2, 1, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1)],
    [(0, 0, 1, 1), (1, 0, 1, 1), (2, 0, 1, 1), (3, 0, 1, 1)],
    [(0, 0, 3, 3), (0, 3, 1, 1), (1, 3, 1, 1), (2, 3, 1, 1)],
    [(0, 0, 3, 3), (3, 0, 1, 1), (3, 1, 1, 1), (3, 2, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1)],
    [(0, 0, 2, 2), (0, 2, 1, 1), (1, 2, 1, 1), (2, 0, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (0, 3, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1), (1, 3, 1, 1)],
    [(0, 0, 3, 3), (0, 3, 1, 1), (1, 3, 1, 1), (2, 3, 1, 1), (3, 0, 1, 1), (3, 1, 1, 1), (3, 2, 1, 1), (3, 3, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1), (2, 0, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1)],
    [(0, 0, 2, 2), (0, 2, 1, 1), (0, 3, 1, 1), (1, 2, 1, 1), (1, 3, 1, 1),
     (2, 0, 2, 2), (2, 2, 1, 1), (2, 3, 1, 1), (3, 2, 1, 1), (3, 3, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (0, 3, 1, 1), (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1), (1, 3, 1, 1),
     (2, 0, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1), (2, 3, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (0, 3, 1, 1), (0, 4, 1, 1),
     (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1), (1, 3, 1, 1), (1, 4, 1, 1),
     (2, 0, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1), (2, 3, 1, 1), (2, 4, 1, 1)],
    [(0, 0, 1, 1), (0, 1, 1, 1), (0, 2, 1, 1), (0, 3, 1, 1),
     (1, 0, 1, 1), (1, 1, 1, 1), (1, 2, 1, 1), (1, 3, 1, 1),
     (2, 0, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1), (2, 3, 1, 1),
     (3, 0, 1, 1), (3, 1, 1, 1), (3, 2, 1, 1), (3, 3, 1, 1)],
]

class Label(QLabel):
    """序号标签。用于布局的编号"""
    def __init__(self, text):
        super(Label, self).__init__()
        self.setText(text)
        self.setFont(QFont('微软雅黑', 13, QFont.Bold))
        self.setAlignment(Qt.AlignCenter)
        self.setStyleSheet('background-color:#4682B4')

class LayoutWidget(QLabel):
    """布局表示
    展示一种布局
    """
    clicked = pyqtSignal(int)

    def __init__(self, layout, number):
        super(LayoutWidget, self).__init__()
        self.number = number  # 布局编号
        mainLayout = QGridLayout(self)
        for index, rect in enumerate(layout):
            y, x, h, w = rect
            mainLayout.addWidget(Label(str(index + 1)), y, x, h, w)

    def mousePressEvent(self, QMouseEvent):
        self.clicked.emit(self.number)

    def enterEvent(self, QEvent):
        self.setStyleSheet('background-color:#AFEEEE')

    def leaveEvent(self, QEvent):
        self.setStyleSheet('background-color:#00000000')


class LayoutSettingPanel(QWidget):
    """布局选择窗口"""
    layoutConfig = pyqtSignal(list)

    def __init__(self):
        super(LayoutSettingPanel, self).__init__()
        self.resize(1280, 720)
        self.setWindowTitle('选择布局方式')

        # 排列各种布局方式
        mainLayout = QGridLayout(self)
        mainLayout.setSpacing(15)
        mainLayout.setContentsMargins(15, 15, 15, 15)
        layoutWidgetList = []
        for index, layout in enumerate(layoutList):
            widget = LayoutWidget(layout, index)
            widget.clicked.connect(self.sendLayout)
            mainLayout.addWidget(widget, index // 4, index % 4)
            layoutWidgetList.append(widget)

    def sendLayout(self, number):
        self.layoutConfig.emit(layoutList[number])
        self.hide()
