import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubMenu } from './sub-menu';

describe('SubMenu', () => {
  let component: SubMenu;
  let fixture: ComponentFixture<SubMenu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubMenu],
    }).compileComponents();

    fixture = TestBed.createComponent(SubMenu);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
